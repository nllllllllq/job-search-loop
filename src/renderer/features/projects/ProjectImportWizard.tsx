import { useEffect, useState } from 'react';
import type { ProjectImportPreview, ProjectInput, ProjectSegmentPreview } from '../../../shared/domain';
import { projectPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
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

export function ProjectImportWizard({ open, onClose, onCompleted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProjectImportPreview | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, setPending] = useState<ProjectSegmentPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setPending([]);
    setStep(1);
    setBusy(false);
    setMessage('');
  }, [open]);

  const close = async () => {
    if (preview) await window.jobSearch.imports.cancel(preview.sessionId).catch(() => undefined);
    onClose();
  };

  const parse = async () => {
    if (!file || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await window.jobSearch.imports.previewProjectsFromDocument({
        name: file.name,
        type: file.type,
        bytes: await fileBytes(file),
      });
      setPreview(result);
      setPending(result.segments);
    } catch {
      setMessage('文件解析失败，请确认格式和内容后重试');
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
    setPending((current) => current.map((segment) => segment.tempId === tempId
      ? {
        ...segment,
        name: key === 'name' ? value : segment.name,
        suggested: { ...segment.suggested, [key]: value },
      }
      : segment));
  };

  const savePending = async () => {
    if (!pending.length || busy) return;
    setBusy(true);
    setMessage('');
    const remaining = [...pending];
    while (remaining.length) {
      const segment = remaining[0]!;
      const parsed = projectPayloadSchema.safeParse(segment.suggested);
      if (!parsed.success) {
        setMessage(`${segment.name}字段不完整，请修改后重试`);
        break;
      }
      try {
        await window.jobSearch.assets.projects.save(parsed.data);
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
          {preview && step === 1 ? (
            <button className="button button--primary" disabled={busy} onClick={() => setStep(2)} type="button">进入字段确认</button>
          ) : null}
          {preview && step === 2 ? (
            <button className="button button--primary" disabled={busy || !pending.length} onClick={() => void savePending()} type="button">
              {busy
                ? '保存中…'
                : pending.length === preview.segments.length
                  ? `保存 ${pending.length} 个项目`
                  : `重试 ${pending.length} 个项目`}
            </button>
          ) : null}
        </>
      )}
      onClose={() => void close()}
      open={open}
      title="从文件导入项目"
    >
      {!preview ? (
        <section className="import-source">
          <Field label="选择项目文件" hint="DOCX、PDF、TXT、MD，原文件不会保存">
            <input
              accept=".docx,.pdf,.txt,.md,.markdown"
              aria-label="选择项目文件"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <button className="button button--primary" disabled={!file || busy} onClick={() => void parse()} type="button">
            {busy ? '解析中…' : '解析文件'}
          </button>
        </section>
      ) : null}

      {preview && step === 1 ? (
        <section className="segment-review">
          <div className="import-preview-meta">
            <strong>{preview.sourceSummary}</strong>
            <span>先确认分段和顺序，再检查字段。</span>
          </div>
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

      {preview && step === 2 ? (
        <section className="project-import-editors">
          {pending.map((segment, index) => (
            <details key={segment.tempId} open={index === 0}>
              <summary>{index + 1}. {segment.suggested.name}</summary>
              <div className="editor-form">
                <Field label="项目名称" required>
                  <input onChange={(event) => updateSuggested(segment.tempId, 'name', event.target.value)} value={segment.suggested.name} />
                </Field>
                {editableFields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <textarea
                      onChange={(event) => updateSuggested(segment.tempId, key, event.target.value)}
                      rows={key === 'unclassifiedNotes' ? 5 : 3}
                      value={segment.suggested[key] ?? ''}
                    />
                  </Field>
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
