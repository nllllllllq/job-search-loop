import { type FormEvent, useEffect, useState } from 'react';
import { ZodError } from 'zod';
import type {
  ImportedImageInput,
  PositionCreateInput,
  PositionImportPreview,
  PositionInput,
} from '../../../shared/domain';
import {
  POSITION_IMPORT_IMAGE_MAX_BYTES,
  POSITION_IMPORT_IMAGE_MAX_COUNT,
  positionImportImagesSchema,
  positionCreateInputSchema,
} from '../../../shared/schemas';
import type { AppError } from '../../../shared/ipc';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

type Tab = 'manual' | 'text' | 'images';

const initialStageOptions: Array<{
  value: NonNullable<PositionCreateInput['initialStage']>;
  label: string;
  dateLabel: string;
}> = [
  { value: 'interested', label: '感兴趣', dateLabel: '记录时间' },
  { value: 'applied', label: '已投递', dateLabel: '投递时间' },
  { value: 'assessment', label: '测评', dateLabel: '收到通知时间' },
  { value: 'interview', label: '面试', dateLabel: '收到通知时间' },
  { value: 'offer', label: 'Offer', dateLabel: '收到 Offer 时间' },
];

function localIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyPosition(): PositionCreateInput {
  return {
    company: '',
    title: '',
    location: '',
    interest: 3,
    rawJd: '',
    initialStage: 'applied',
    initialDate: localIsoDate(),
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: PositionCreateInput) => Promise<void>;
}

async function fileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });
}

async function imageInput(file: File): Promise<ImportedImageInput> {
  const bytes = await fileBytes(file);
  let width = 1;
  let height = 1;
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  }
  return { name: file.name, type: file.type, bytes, width, height };
}

function validateImageFiles(files: File[]): void {
  if (files.length > POSITION_IMPORT_IMAGE_MAX_COUNT) {
    throw new Error('Select no more than 10 images.');
  }
  for (const file of files) {
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      throw new Error('Only PNG and JPEG images are supported.');
    }
    if (file.size > POSITION_IMPORT_IMAGE_MAX_BYTES) {
      throw new Error('Each image must be 12 MB or smaller.');
    }
  }
}

async function imageInputs(files: File[]): Promise<ImportedImageInput[]> {
  validateImageFiles(files);
  const inputs: ImportedImageInput[] = [];
  for (const file of files) inputs.push(await imageInput(file));
  return positionImportImagesSchema.parse({ images: inputs }).images;
}

function imageErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Invalid image input.';
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'AI_INVALID_OUTPUT') return 'AI 返回格式不完整，请重新识别或改用手动录入';
    if (error.code === 'AI_NOT_CONFIGURED') return '尚未配置 AI 服务，请先到设置完成配置';
    if (error.code === 'AI_AUTH_FAILED') return 'AI 服务认证失败，请检查 API Key';
    if (error.code === 'AI_TIMEOUT') return 'AI 识别超时，请稍后重试';
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '截图识别失败，请检查格式、大小后重试';
}

function confidenceLabel(value: number): string {
  if (value >= 0.8) return '高置信';
  if (value >= 0.55) return '需确认';
  return '低置信';
}

export function PositionIntakePanel({ open, onClose, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('images');
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [preview, setPreview] = useState<PositionImportPreview | null>(null);
  const [value, setValue] = useState<PositionCreateInput>(emptyPosition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageInputUnsupported, setImageInputUnsupported] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PositionCreateInput, string>>>({});

  useEffect(() => {
    if (!open) return;
    setTab('images');
    setText('');
    setImages([]);
    setPreview(null);
    setValue(emptyPosition());
    setBusy(false);
    setError('');
    setImageInputUnsupported(false);
    setErrors({});
  }, [open]);

  const close = async () => {
    if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    onClose();
  };

  const applyPreview = (next: PositionImportPreview) => {
    setPreview(next);
    setValue({
      ...next.suggested,
      initialStage: value.initialStage ?? 'applied',
      initialDate: value.initialDate ?? localIsoDate(),
    });
    setErrors({
      ...(!next.suggested.company.trim() ? { company: 'AI 未识别公司名称，请补充' } : {}),
      ...(!next.suggested.title.trim() ? { title: 'AI 未识别岗位名称，请补充' } : {}),
      ...(!next.suggested.rawJd.trim() ? { rawJd: 'AI 未识别完整 JD，请补充' } : {}),
    });
  };

  const parseText = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      applyPreview(await window.jobSearch.imports.previewPositionFromText(text));
    } catch {
      setError('文本解析失败，请检查内容后重试');
    } finally {
      setBusy(false);
    }
  };

  const parseImages = async () => {
    if (!images.length || busy) return;
    setBusy(true);
    setError('');
    setImageInputUnsupported(false);
    try {
      const inputs = await imageInputs(images);
      applyPreview(await window.jobSearch.imports.previewPositionFromImages(inputs));
    } catch (caught) {
      if ((caught as Partial<AppError>)?.code === 'AI_INPUT_UNSUPPORTED') {
        setImageInputUnsupported(true);
      } else {
        setError(imageErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const useTextFallback = async () => {
    if (!images.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const inputs = await imageInputs(images);
      applyPreview(await window.jobSearch.imports.previewPositionFromImages(inputs, 'ocr-text'));
      setImageInputUnsupported(false);
    } catch (caught) {
      setError(imageErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = positionCreateInputSchema.safeParse(value);
    if (!parsed.success) {
      const next: Partial<Record<keyof PositionCreateInput, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PositionCreateInput;
        if (key === 'company' || key === 'title') next[key] = '请输入 1–120 个字符';
        else if (key === 'rawJd') next[key] = '请输入原始 JD';
        else next[key] = '请检查此字段';
      }
      setErrors(next);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(parsed.data);
      if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    } catch {
      setError('保存失败，已保留当前内容，可直接重试');
    } finally {
      setBusy(false);
    }
  };

  const moveImage = (index: number, offset: number) => {
    setImages((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const chooseTab = (nextTab: Tab) => {
    if (preview) void window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    setTab(nextTab);
    setPreview(null);
    setValue(emptyPosition());
    setError('');
    setImageInputUnsupported(false);
    setErrors({});
  };

  return (
    <Modal
      closeDisabled={busy}
      dismissal="close-button-only"
      footer={imageInputUnsupported || (tab !== 'manual' && !preview) ? null : (
        <button className="button button--primary" disabled={busy} form="position-intake-form" type="submit">
          {busy ? '处理中…' : preview ? '确认录入岗位' : '保存岗位'}
        </button>
      )}
      onClose={() => void close()}
      open={open}
      title="录入岗位"
    >
      <div className="import-tabs" role="tablist" aria-label="岗位录入方式">
        {([
          ['manual', '手动录入'],
          ['text', '粘贴文本'],
          ['images', '截图识别'],
        ] as const).map(([key, label]) => (
          <button
            aria-selected={tab === key}
            className={tab === key ? 'is-active' : ''}
            key={key}
            onClick={() => chooseTab(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'text' && !preview ? (
        <section className="import-source">
          <Field label="粘贴岗位文本" hint="支持公司、岗位、地点字段和完整 JD 原文">
            <textarea aria-label="粘贴岗位文本" onChange={(event) => setText(event.target.value)} rows={10} value={text} />
          </Field>
          <button className="button button--primary" disabled={busy || !text.trim()} onClick={() => void parseText()} type="button">
            {busy ? '解析中…' : '解析文本'}
          </button>
        </section>
      ) : null}

      {tab === 'images' && !preview && !imageInputUnsupported ? (
        <section className="import-source">
          <Field label="选择岗位截图" hint="最多 10 张，可调整顺序；AI 会按此顺序识别，原图不会保存">
            <input
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              aria-label="选择岗位截图"
              multiple
              onChange={(event) => setImages(Array.from(event.target.files ?? []))}
              type="file"
            />
          </Field>
          <ol className="import-file-list">
            {images.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}`}>
                <span>{index + 1}. {file.name}</span>
                <span>
                  <button disabled={index === 0} onClick={() => moveImage(index, -1)} type="button">上移</button>
                  <button disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} type="button">下移</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="import-source__actions">
            <button className="button button--primary" disabled={busy || !images.length} onClick={() => void parseImages()} type="button">
              {busy ? 'AI 识别中…' : '开始 AI 识别'}
            </button>
          </div>
        </section>
      ) : null}

      {(tab === 'manual' || preview) ? (
        <form className="editor-form import-review-form" id="position-intake-form" noValidate onSubmit={submit}>
          {preview ? (
            <div className="import-preview-meta">
              <strong>{preview.sourceSummary}</strong>
              {(() => {
                const missing = [
                  !value.company.trim() ? '公司名称' : null,
                  !value.title.trim() ? '岗位名称' : null,
                  !value.rawJd.trim() ? '完整 JD' : null,
                ].filter((item): item is string => item !== null);
                return missing.length ? <span className="import-preview-missing" role="alert">缺少：{missing.join('、')}</span> : null;
              })()}
              {!value.location?.trim() ? <span>工作位置未识别，可稍后补充</span> : null}
              {preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          ) : null}
          <div className="editor-form__grid">
            <Field error={errors.company} label={`公司${preview ? ` · ${confidenceLabel(preview.confidence.company)}` : ''}`} required>
              <input onChange={(event) => {
                setValue({ ...value, company: event.target.value });
                setErrors((current) => ({ ...current, company: undefined }));
              }} value={value.company} />
            </Field>
            <Field error={errors.title} label={`岗位名称${preview ? ` · ${confidenceLabel(preview.confidence.title)}` : ''}`} required>
              <input onChange={(event) => {
                setValue({ ...value, title: event.target.value });
                setErrors((current) => ({ ...current, title: undefined }));
              }} value={value.title} />
            </Field>
          </div>
          <div className="editor-form__grid">
            <Field label={`位置${preview ? ` · ${confidenceLabel(preview.confidence.location)}` : ''}`}>
              <input onChange={(event) => setValue({ ...value, location: event.target.value })} value={value.location ?? ''} />
            </Field>
            <Field label="兴趣度">
              <select
                onChange={(event) => setValue({ ...value, interest: Number(event.target.value) as PositionInput['interest'] })}
                value={value.interest}
              >
                {[1, 2, 3, 4, 5].map((interest) => <option key={interest}>{interest}</option>)}
              </select>
            </Field>
          </div>
          <div className="editor-form__grid">
            <Field label="当前阶段">
              <select
                onChange={(event) => setValue({
                  ...value,
                  initialStage: event.target.value as PositionCreateInput['initialStage'],
                })}
                value={value.initialStage}
              >
                {initialStageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field error={errors.initialDate} label={initialStageOptions.find((option) => option.value === value.initialStage)?.dateLabel ?? '初始日期'}>
              <input
                onChange={(event) => {
                  setValue({ ...value, initialDate: event.target.value });
                  setErrors((current) => ({ ...current, initialDate: undefined }));
                }}
                type="date"
                value={value.initialDate ?? ''}
              />
            </Field>
          </div>
          <Field error={errors.rawJd} label="原始 JD" required>
            <textarea onChange={(event) => {
              setValue({ ...value, rawJd: event.target.value });
              setErrors((current) => ({ ...current, rawJd: undefined }));
            }} rows={12} value={value.rawJd} />
          </Field>
        </form>
      ) : null}
      {error ? <p className="import-error" role="alert">{error}</p> : null}
      {imageInputUnsupported ? (
        <div className="import-error" role="alert">
          <p>当前模型不支持直接读取图片，可以改用本地 OCR 提取文字后再由 AI 整理。</p>
          <button className="button button--quiet" disabled={busy} onClick={() => void useTextFallback()} type="button">使用本地 OCR</button>
          <button className="button button--quiet" disabled={busy} onClick={() => void close()} type="button">关闭</button>
        </div>
      ) : null}
    </Modal>
  );
}
