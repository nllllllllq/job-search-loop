import { useEffect, useState } from 'react';
import type {
  ImportedFileInput,
  Project,
  ProjectImportField,
  ProjectImportFieldValue,
  ProjectImportPreview,
  ProjectInput,
  ProjectSegmentPreview,
} from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import { projectPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
  existingProject?: Project;
}

function sourceTextFromEvidence(evidence: string): string {
  return evidence
    .replace(/^L\d+(?:\s*-\s*L?\d+)?\s*[:：—-]?\s*/i, '')
    .trim();
}

function FieldAudit({
  field,
  value,
  accepted,
  onAccept,
  onRestore,
}: {
  field: { provenance: 'source' | 'ai-rewrite' | 'ai-suggestion'; evidence: string };
  value: string;
  accepted: boolean;
  onAccept: () => void;
  onRestore: () => void;
}) {
  const label = field.provenance === 'source'
    ? '原文'
    : field.provenance === 'ai-rewrite' ? 'AI 改写（有原文依据）' : 'AI 建议（需确认）';
  return (
    <div className="field-audit">
      <span className={`field-audit__badge field-audit__badge--${field.provenance}`}>{label}</span>
      {field.evidence ? <small>依据：{field.evidence}</small> : null}
      {field.provenance === 'ai-rewrite' ? (
        <>
          <p className="project-import-diff-original"><del>{sourceTextFromEvidence(field.evidence)}</del></p>
          <p className="project-import-diff-suggestion"><mark>{value}</mark></p>
        </>
      ) : null}
      {field.provenance === 'ai-suggestion' && value ? (
        <p className="project-import-diff-suggestion"><mark>{value}</mark></p>
      ) : null}
      {field.provenance === 'ai-suggestion' ? (
        <button onClick={onAccept} type="button">{accepted ? '已接受' : '接受建议'}</button>
      ) : null}
      <button onClick={onRestore} type="button">还原建议</button>
    </div>
  );
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

const editableFields: Array<[keyof ProjectInput, string]> = [
  ['projectTime', '项目时间'],
  ['background', '背景'],
  ['goal', '目标'],
  ['role', '角色'],
  ['keyDecisions', '关键决策'],
  ['outcome', '结果'],
  ['evidence', '证据'],
  ['reflections', '反思'],
  ['storytellingVersions', '讲述版本'],
  ['unclassifiedNotes', '待整理内容'],
];

function auditField(segment: ProjectSegmentPreview, key: ProjectImportField): ProjectImportFieldValue {
  return segment.fields[key] ?? {
    value: segment.suggested[key] ?? '',
    provenance: 'ai-suggestion',
    evidence: '',
  };
}

function existingProjectText(project: Project): string {
  return [
    `项目名称：${project.name}`,
    `项目角色：${project.role}`,
    `项目时间：${project.projectTime ?? ''}`,
    '项目内容：',
    project.unclassifiedNotes,
  ].join('\n');
}

function importErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as Partial<AppError>).code
    : undefined;
  switch (code) {
    case 'AI_NOT_CONFIGURED': return '尚未配置 AI 服务，请先到设置完成配置';
    case 'AI_AUTH_FAILED': return 'AI 服务认证失败，请检查 API Key';
    case 'AI_RATE_LIMITED': return 'AI 请求过于频繁，请稍后重试';
    case 'AI_TIMEOUT': return 'AI 解析超时，请稍后重试';
    case 'AI_INVALID_OUTPUT': return 'AI 返回格式无效，请重试';
    case 'AI_INPUT_UNSUPPORTED':
    case 'VALIDATION_ERROR': return '当前内容不支持 AI 解析，请检查文件或文本后重试';
    default: return 'AI 解析失败，请稍后重试';
  }
}

export function ProjectImportWizard({ open, onClose, onCompleted, existingProject }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<ProjectImportPreview | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, setPending] = useState<ProjectSegmentPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Record<string, boolean>>({});
  const [aiLabel, setAiLabel] = useState('正在读取 AI 配置…');

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPasteText(existingProject ? existingProjectText(existingProject) : '');
    setPreview(null);
    setPending([]);
    setStep(1);
    setBusy(false);
    setMessage('');
    setAcceptedSuggestions({});
    setAiLabel('正在读取 AI 配置…');
    void window.jobSearch.ai.settings.get()
      .then((settings) => {
        setAiLabel(settings.hasApiKey && settings.baseUrl && settings.model
          ? `${settings.baseUrl} · ${settings.model}`
          : '当前未配置 AI，点击解析后会提示错误');
      })
      .catch(() => {
        setAiLabel('AI 配置暂不可用');
      });
  }, [existingProject, open]);

  const close = async () => {
    if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    onClose();
  };

  const parse = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      let input: ImportedFileInput | null = null;
      if (file && !existingProject) {
        input = {
          name: file.name,
          type: file.type,
          bytes: await fileBytes(file),
        };
      } else if (pasteText.trim()) {
        input = {
          name: existingProject ? 'existing-project.txt' : 'pasted-project-text.txt',
          type: 'text/plain',
          bytes: new TextEncoder().encode(pasteText),
        };
      }
      if (!input) return;
      const result = await window.jobSearch.imports.previewProjectsFromDocument(
        input,
        'ai',
      );
      setPreview(result);
      setPending(result.segments);
      setAcceptedSuggestions({});
    } catch (error) {
      setMessage(importErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const applyOperation = async (
    operation: Parameters<typeof window.jobSearch.imports.updateProjectSegments>[1],
  ) => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const next = await window.jobSearch.imports.updateProjectSegments(preview.sessionId, operation);
      setPreview(next);
      setPending(next.segments);
    } catch {
      setMessage('分段调整失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const updateSuggested = (tempId: string, key: keyof ProjectInput, value: string) => {
    setAcceptedSuggestions((current) => ({ ...current, [`${tempId}:${key}`]: true }));
    setPending((current) => current.map((segment) => segment.tempId === tempId
      ? {
        ...segment,
        name: key === 'name' ? value : segment.name,
        suggested: { ...segment.suggested, [key]: value },
      }
      : segment));
  };

  const restoreSuggested = (segment: ProjectSegmentPreview, key: keyof ProjectInput) => {
    const field = auditField(segment, key);
    const restoredValue = field.provenance === 'ai-rewrite'
      ? sourceTextFromEvidence(field.evidence)
      : field.value;
    setPending((current) => current.map((item) => item.tempId === segment.tempId
      ? {
        ...item,
        name: key === 'name' ? restoredValue : item.name,
        suggested: { ...item.suggested, [key]: restoredValue },
        fields: field.provenance === 'ai-rewrite'
          ? {
            ...item.fields,
            [key]: { value: restoredValue, provenance: 'source', evidence: field.evidence },
          }
          : item.fields,
      }
      : item));
    if (field.provenance === 'ai-suggestion') {
      setAcceptedSuggestions((current) => ({ ...current, [`${segment.tempId}:${key}`]: false }));
    }
  };

  const acceptSuggestion = (tempId: string, key: ProjectImportField) => {
    setAcceptedSuggestions((current) => ({ ...current, [`${tempId}:${key}`]: true }));
  };

  const acceptAllSuggestions = () => {
    setAcceptedSuggestions(Object.fromEntries(pending.flatMap((segment) => (
      Object.entries(segment.fields)
        .filter(([, field]) => field.provenance === 'ai-suggestion' && field.value)
        .map(([key]) => [`${segment.tempId}:${key}`, true])
    ))));
  };

  const hasSource = Boolean(file || pasteText.trim());

  const saveableProject = (segment: ProjectSegmentPreview): ProjectInput => {
    const value = { ...segment.suggested };
    (Object.keys(segment.fields) as ProjectImportField[]).forEach((key) => {
      const field = segment.fields[key];
      const accepted = field.provenance !== 'ai-suggestion'
        || acceptedSuggestions[`${segment.tempId}:${key}`];
      if (existingProject) {
        const existingValue = existingProject[key] ?? '';
        if (key === 'unclassifiedNotes' || !accepted || !value[key]?.trim()) {
          value[key] = existingValue;
        }
      } else if (!accepted) {
        value[key] = '';
      }
    });
    if (existingProject) {
      value.name = value.name?.trim() ? value.name : existingProject.name;
      value.role = value.role?.trim() ? value.role : existingProject.role;
      value.projectTime = value.projectTime?.trim() ? value.projectTime : existingProject.projectTime ?? '';
      value.unclassifiedNotes = existingProject.unclassifiedNotes;
    }
    return value;
  };

  const savePending = async () => {
    if (!pending.length || busy) return;
    if (existingProject && pending.length !== 1) {
      setMessage('现有项目整理需保留一个分段，请先合并或移除其他分段');
      return;
    }
    setBusy(true);
    setMessage('');
    const remaining = [...pending];
    while (remaining.length) {
      const segment = remaining[0]!;
      const parsed = projectPayloadSchema.safeParse(saveableProject(segment));
      if (!parsed.success) {
        setMessage(`${segment.name}字段不完整，请修改后重试`);
        break;
      }
      try {
        await window.jobSearch.assets.projects.save(existingProject
          ? { ...parsed.data, id: existingProject.id }
          : parsed.data);
        remaining.shift();
        setPending([...remaining]);
      } catch {
        setMessage(`${segment.name}保存失败，可重试未保存项目`);
        break;
      }
    }
    if (remaining.length === 0) {
      if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
      await onCompleted();
      onClose();
    }
    setBusy(false);
  };

  const reorder = (index: number, offset: number) => {
    if (!preview) return;
    const ids = preview.segments.map((item) => item.tempId);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void applyOperation({ type: 'reorder', orderedIds: ids });
  };

  return (
    <Modal
      closeDisabled={busy}
      footer={(
        <>
          <button className="button button--quiet" disabled={busy} onClick={() => void close()} type="button">取消</button>
          {preview && step === 1 && preview.classification === 'valid-project' ? (
            <button
              className="button button--primary"
              disabled={busy || (Boolean(existingProject) && pending.length !== 1)}
              onClick={() => setStep(2)}
              type="button"
            >
              进入字段确认
            </button>
          ) : null}
          {preview && step === 2 && preview.classification === 'valid-project' ? (
            <button className="button button--primary" disabled={busy || !pending.length} onClick={() => void savePending()} type="button">
              {busy
                ? '保存中…'
                : existingProject
                  ? '保存项目'
                : pending.length === preview.segments.length
                  ? `保存 ${pending.length} 个项目`
                  : `重试 ${pending.length} 个项目`}
            </button>
          ) : null}
        </>
      )}
      onClose={() => void close()}
      open={open}
      title={existingProject ? 'AI 整理项目' : '从文件导入项目'}
    >
      {!preview ? (
        <section className="import-source">
          {!existingProject ? (
            <Field label="选择项目文件" hint="DOCX、PDF、TXT、MD，原文件不会保存">
              <input
                accept=".docx,.pdf,.txt,.md,.markdown"
                aria-label="选择项目文件"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  if (event.target.files?.[0]) setPasteText('');
                }}
                type="file"
              />
            </Field>
          ) : null}
          <Field
            label="粘贴项目文本"
            hint={existingProject
              ? '来源可编辑；确认前会把当前文本发送给 AI，原项目内容保存时仍会原样保留。'
              : '可直接粘贴补充材料；仅会在解析时作为 TXT 文本处理'}
          >
            <textarea
              aria-label="粘贴项目文本"
              onChange={(event) => {
                setPasteText(event.target.value);
                if (event.target.value) setFile(null);
              }}
              placeholder="粘贴项目经历、行动、结果或复盘材料"
              rows={6}
              value={pasteText}
            />
          </Field>
          {hasSource ? (
            <div className="project-import-ai-note">
              <strong>AI 辅助解析</strong>
              <p>点击后会把本机提取后的纯文本发送到当前外部 AI，点击即表示确认；原始文件不会外发。</p>
              <span>{aiLabel}</span>
            </div>
          ) : null}
          <div className="project-import-parse-actions">
            <button className="button button--primary" disabled={!hasSource || busy} onClick={() => void parse()} type="button">
              {busy ? '解析中…' : existingProject ? 'AI 整理' : 'AI 辅助解析'}
            </button>
          </div>
        </section>
      ) : null}

      {preview && preview.classification === 'no-valid-project' ? (
        <section className="import-empty-result" role="status">
          <strong>未识别到可保存的项目</strong>
          <p>{preview.explanation}</p>
          {preview.warnings.length ? (
            <ul className="import-warning-list">
              {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          <p>本次不会创建或保存任何项目；请修改来源后重试。</p>
        </section>
      ) : null}

      {preview && step === 1 && preview.classification === 'valid-project' ? (
        <section className="segment-review">
          <div className="import-preview-meta">
            <strong>{preview.sourceSummary}</strong>
            <span>{preview.explanation}</span>
            <span>先确认分段和顺序，再检查字段。</span>
            <span className={`import-analysis-mode import-analysis-mode--${preview.analysisMode}`}>
              {preview.analysisMode === 'ai'
                ? 'AI 已完成项目识别与字段预填'
                : 'AI 尚未完成解析'}
            </span>
          </div>
          {existingProject && pending.length !== 1 ? (
            <p className="import-preview-missing" role="status">
              现有项目整理需保留一个分段，请先合并或移除其他分段。
            </p>
          ) : null}
          {preview.warnings.length ? (
            <ul className="import-warning-list">
              {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          {preview.segments.map((segment, index) => (
            <article className="segment-card" key={segment.tempId}>
              <input
                aria-label={`项目 ${index + 1} 名称`}
                onBlur={(event) => void applyOperation({
                  type: 'rename',
                  tempId: segment.tempId,
                  name: event.target.value,
                })}
                onChange={(event) => setPreview({
                  ...preview,
                  segments: preview.segments.map((item) => item.tempId === segment.tempId
                    ? { ...item, name: event.target.value }
                    : item),
                })}
                value={segment.name}
              />
              <p>{segment.sourceText.slice(0, 240)}</p>
              <div className="segment-actions">
                <button disabled={index === 0} onClick={() => reorder(index, -1)} type="button">上移</button>
                <button disabled={index === preview.segments.length - 1} onClick={() => reorder(index, 1)} type="button">下移</button>
                <button
                  disabled={index === preview.segments.length - 1}
                  onClick={() => void applyOperation({ type: 'merge-next', tempId: segment.tempId })}
                  type="button"
                >
                  与下一项合并
                </button>
                <button
                  onClick={() => {
                    const marker = segment.sourceText.split(/\n\s*\n/)[1]?.trim();
                    if (marker) void applyOperation({ type: 'split', tempId: segment.tempId, marker });
                    else setMessage('该分段没有可用于拆分的空行');
                  }}
                  type="button"
                >
                  按空行拆分
                </button>
                <button onClick={() => void applyOperation({ type: 'remove', tempId: segment.tempId })} type="button">取消此项目</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {preview && step === 2 && preview.classification === 'valid-project' ? (
        <section className="project-import-editors">
          <div className="segment-actions">
            <button onClick={acceptAllSuggestions} type="button">接受所有 AI 建议</button>
          </div>
          {pending.map((segment, index) => (
            <details key={segment.tempId} open={index === 0}>
              <summary>{index + 1}. {segment.suggested.name}</summary>
              <div className="editor-form">
                <Field label="项目名称" required>
                  <input onChange={(event) => updateSuggested(segment.tempId, 'name', event.target.value)} value={segment.suggested.name} />
                </Field>
                <FieldAudit
                    accepted={Boolean(acceptedSuggestions[`${segment.tempId}:name`])}
                    field={auditField(segment, 'name')}
                    value={segment.suggested.name}
                    onAccept={() => acceptSuggestion(segment.tempId, 'name')}
                    onRestore={() => restoreSuggested(segment, 'name')}
                  />
                {(existingProject
                  ? editableFields.filter(([key]) => key !== 'unclassifiedNotes')
                  : editableFields).map(([key, label]) => (
                  <div key={key}>
                  <Field label={label}>
                    <textarea
                      readOnly={Boolean(existingProject && key === 'unclassifiedNotes')}
                      onChange={(event) => updateSuggested(segment.tempId, key, event.target.value)}
                      rows={key === 'unclassifiedNotes' ? 5 : 3}
                      value={segment.suggested[key] ?? ''}
                    />
                  </Field>
                    <FieldAudit
                      accepted={Boolean(acceptedSuggestions[`${segment.tempId}:${key}`])}
                      field={auditField(segment, key)}
                      value={segment.suggested[key] ?? ''}
                      onAccept={() => acceptSuggestion(segment.tempId, key)}
                      onRestore={() => restoreSuggested(segment, key)}
                    />
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      ) : null}
      {message ? <p className="import-error" role="alert">{message}</p> : null}
    </Modal>
  );
}
