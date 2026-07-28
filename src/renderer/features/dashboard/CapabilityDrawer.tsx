import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Capability, CapabilityInput } from '../../../shared/domain';
import { capabilityPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { DashboardDrawer } from './DashboardDrawer';

interface CapabilityDrawerProps {
  onClose: () => void;
  open: boolean;
  onChanged?: () => void;
}

type CapabilityEditorState =
  | { mode: 'create' }
  | { mode: 'edit'; capability: Capability }
  | { mode: 'merge'; capability: Capability }
  | null;

interface CapabilityDraft {
  name: string;
  frequency: string;
  evidence: string;
  gaps: string;
  mergedIntoId: string | null;
}

function toDraft(capability?: Capability): CapabilityDraft {
  return {
    name: capability?.name ?? '',
    frequency: String(capability?.jdFrequency ?? 0),
    evidence: capability?.evidence ?? '',
    gaps: capability?.gaps ?? '',
    mergedIntoId: capability?.mergedIntoId ?? null,
  };
}

export function CapabilityDrawer({
  onClose,
  open,
  onChanged,
}: CapabilityDrawerProps) {
  const toast = useToast();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [editor, setEditor] = useState<CapabilityEditorState>(null);
  const [draft, setDraft] = useState<CapabilityDraft>(() => toDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const requestGeneration = useRef(0);

  const load = async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await window.jobSearch.assets.capabilities.list();
      if (generation !== requestGeneration.current) return;
      setCapabilities(result);
    } catch {
      if (generation !== requestGeneration.current) return;
      setLoadError('能力主题读取失败，请稍后重试。');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      requestGeneration.current += 1;
      setLoading(false);
      return;
    }
    setEditor(null);
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [open]);

  const activeCapabilities = useMemo(
    () => capabilities
      .filter((item) => item.mergedIntoId === null)
      .sort((left, right) => right.jdFrequency - left.jdFrequency),
    [capabilities],
  );

  const openEditor = (next: CapabilityEditorState) => {
    setEditor(next);
    setErrors({});
    setSaveError('');
    setDraft(toDraft(next && 'capability' in next ? next.capability : undefined));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || editor === null) return;
    if (
      draft.frequency.trim() === ''
      || !Number.isInteger(Number(draft.frequency))
      || Number(draft.frequency) < 0
    ) {
      setErrors((current) => ({ ...current, frequency: '请输入非负整数' }));
      return;
    }
    const input: CapabilityInput = {
      name: draft.name,
      jdFrequency: Number(draft.frequency),
      evidence: draft.evidence,
      gaps: draft.gaps,
      mergedIntoId: editor.mode === 'merge' ? draft.mergedIntoId : null,
    };
    const parsed = capabilityPayloadSchema.safeParse(input);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0] ?? 'form')] = issue.message;
      }
      if (!Number.isInteger(Number(draft.frequency)) || Number(draft.frequency) < 0) {
        nextErrors.frequency = '请输入非负整数';
      }
      setErrors(nextErrors);
      return;
    }
    if (
      editor.mode === 'merge'
      && (parsed.data.mergedIntoId === null || parsed.data.mergedIntoId === editor.capability.id)
    ) {
      setErrors({ mergedIntoId: '请选择另一个能力作为合并目标' });
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (editor.mode === 'merge') {
        await window.jobSearch.assets.capabilities.merge(
          editor.capability.id,
          parsed.data.mergedIntoId!,
        );
      } else {
        await window.jobSearch.assets.capabilities.save({
          ...parsed.data,
          ...(editor.mode === 'create' ? {} : { id: editor.capability.id }),
        });
      }
      toast.success(editor.mode === 'merge' ? '能力及其关联已合并。' : '能力主题已保存。');
      setEditor(null);
      await load();
      onChanged?.();
    } catch {
      setSaveError('保存失败，已保留你填写的内容。');
      toast.error('保存能力失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const editingCapability = editor && 'capability' in editor
    ? editor.capability
    : undefined;
  const modalTitle = editor?.mode === 'merge'
    ? `合并 ${editingCapability?.name ?? ''}`
    : editor?.mode === 'edit'
      ? '编辑能力'
      : '新增能力';

  return (
    <DashboardDrawer
      eyebrow="CAPABILITY SIGNALS / 高频能力"
      onClose={onClose}
      open={open}
      title="能力主题"
    >
      <div className="dashboard-drawer__toolbar">
        <p>{activeCapabilities.length} 个可用主题，按 JD 频次排序。</p>
        <button className="button button--primary" onClick={() => openEditor({ mode: 'create' })} type="button">
          新增能力
        </button>
      </div>
      {loading ? <div className="resource-state" role="status">正在读取能力…</div> : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
          {' '}
          <button className="text-button" onClick={() => void load()} type="button">重试</button>
        </p>
      ) : null}
      {!loading && !loadError && activeCapabilities.length === 0 ? (
        <p className="dashboard-drawer__empty">还没有能力主题。</p>
      ) : null}
      <div className="capability-drawer-list">
        {activeCapabilities.map((capability) => (
          <article className="capability-card capability-card--compact" key={capability.id}>
            <div className="capability-card__topline">
              <span>JD 频次 {capability.jdFrequency}</span>
              <div>
                <button
                  aria-label={`编辑 ${capability.name}`}
                  className="text-button"
                  onClick={() => openEditor({ mode: 'edit', capability })}
                  type="button"
                >
                  编辑
                </button>
                <button
                  aria-label={`合并 ${capability.name}`}
                  className="text-button"
                  disabled={activeCapabilities.length < 2}
                  onClick={() => openEditor({ mode: 'merge', capability })}
                  type="button"
                >
                  合并
                </button>
              </div>
            </div>
            <h3 className="user-text">{capability.name}</h3>
            <p className="user-text">{capability.evidence || '暂无证据'}</p>
            {capability.gaps ? <small className="user-text">差距：{capability.gaps}</small> : null}
          </article>
        ))}
      </div>

      <Modal
        closeDisabled={saving}
        footer={(
          <>
            <button className="button button--quiet" disabled={saving} onClick={() => setEditor(null)} type="button">取消</button>
            <button
              className="button button--primary"
              disabled={saving}
              form="capability-drawer-editor"
              type="submit"
            >
              {saving ? '保存中…' : editor?.mode === 'merge' ? '确认合并' : '保存能力'}
            </button>
          </>
        )}
        onClose={() => {
          if (!saving) setEditor(null);
        }}
        open={editor !== null}
        title={modalTitle}
      >
        <form className="editor-form" id="capability-drawer-editor" noValidate onSubmit={submit}>
          <Field error={errors.name} label="能力名称" required>
            <input
              disabled={editor?.mode === 'merge'}
              maxLength={200}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name}
            />
          </Field>
          <Field error={errors.frequency} label="JD 频次" required>
            <input
              disabled={editor?.mode === 'merge'}
              min={0}
              onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}
              step={1}
              type="number"
              value={draft.frequency}
            />
          </Field>
          <Field label="已有证据">
            <textarea
              disabled={editor?.mode === 'merge'}
              maxLength={40_000}
              onChange={(event) => setDraft((current) => ({ ...current, evidence: event.target.value }))}
              rows={5}
              value={draft.evidence}
            />
          </Field>
          <Field label="差距">
            <textarea
              disabled={editor?.mode === 'merge'}
              maxLength={40_000}
              onChange={(event) => setDraft((current) => ({ ...current, gaps: event.target.value }))}
              rows={5}
              value={draft.gaps}
            />
          </Field>
          {editor?.mode === 'merge' ? (
            <>
              <Field
                error={errors.mergedIntoId}
                hint="原能力记录保留用于审计；现有关联会迁移到目标能力。"
                label="合并到"
                required
              >
                <select
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    mergedIntoId: event.target.value || null,
                  }))}
                  value={draft.mergedIntoId ?? ''}
                >
                  <option value="">请选择目标能力</option>
                  {activeCapabilities
                    .filter((item) => item.id !== editor.capability.id)
                    .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
            </>
          ) : null}
          {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
        </form>
      </Modal>
    </DashboardDrawer>
  );
}
