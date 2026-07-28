import { type FormEvent, useEffect, useState } from 'react';
import type {
  ImportedImageInput,
  PositionImportPreview,
  PositionInput,
} from '../../../shared/domain';
import { positionInputSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

type Tab = 'manual' | 'text' | 'images' | 'url';

const emptyPosition: PositionInput = {
  company: '',
  title: '',
  location: '',
  interest: 3,
  rawJd: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: PositionInput) => Promise<void>;
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

function confidenceLabel(value: number): string {
  if (value >= 0.8) return '高置信';
  if (value >= 0.55) return '需确认';
  return '低置信';
}

export function PositionIntakePanel({ open, onClose, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('manual');
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [preview, setPreview] = useState<PositionImportPreview | null>(null);
  const [value, setValue] = useState<PositionInput>(emptyPosition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof PositionInput, string>>>({});

  useEffect(() => {
    if (!open) return;
    setTab('manual');
    setText('');
    setImages([]);
    setPreview(null);
    setValue(emptyPosition);
    setBusy(false);
    setError('');
    setErrors({});
  }, [open]);

  const close = async () => {
    if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    onClose();
  };

  const applyPreview = (next: PositionImportPreview) => {
    setPreview(next);
    setValue(next.suggested);
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
    try {
      const inputs: ImportedImageInput[] = [];
      for (const file of images) inputs.push(await imageInput(file));
      applyPreview(await window.jobSearch.imports.previewPositionFromImages(inputs));
    } catch {
      setError('截图识别失败，请检查格式、大小后重试');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = positionInputSchema.safeParse(value);
    if (!parsed.success) {
      const next: Partial<Record<keyof PositionInput, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PositionInput;
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
    setValue(emptyPosition);
    setError('');
    setErrors({});
  };

  return (
    <Modal
      closeDisabled={busy}
      footer={(
        <>
          <button className="button button--quiet" disabled={busy} onClick={() => void close()} type="button">取消</button>
          <button className="button button--primary" disabled={busy} form="position-intake-form" type="submit">
            {busy ? '处理中…' : '保存岗位'}
          </button>
        </>
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
          ['url', '公开链接'],
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

      {tab === 'images' && !preview ? (
        <section className="import-source">
          <Field label="选择岗位截图" hint="最多 10 张，可调整顺序；仅在本机识别，原图不会保存">
            <input
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              aria-label="选择岗位截图"
              multiple
              onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 10))}
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
          <button className="button button--primary" disabled={busy || !images.length} onClick={() => void parseImages()} type="button">
            {busy ? '本地识别中…' : '开始识别'}
          </button>
        </section>
      ) : null}

      {tab === 'url' ? (
        <section className="import-callout">
          <strong>公开链接导入将在 V1.2 启用</strong>
          <p>当前请使用“粘贴文本”或“截图识别”，链接不会作为岗位字段保存。</p>
        </section>
      ) : null}

      {(tab === 'manual' || preview) ? (
        <form className="editor-form import-review-form" id="position-intake-form" noValidate onSubmit={submit}>
          {preview ? (
            <div className="import-preview-meta">
              <strong>{preview.sourceSummary}</strong>
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
          <Field error={errors.rawJd} label="原始 JD" required>
            <textarea onChange={(event) => {
              setValue({ ...value, rawJd: event.target.value });
              setErrors((current) => ({ ...current, rawJd: undefined }));
            }} rows={12} value={value.rawJd} />
          </Field>
        </form>
      ) : null}
      {error ? <p className="import-error" role="alert">{error}</p> : null}
    </Modal>
  );
}
