import { type FormEvent, useEffect, useState } from 'react';
import type { Capability, CapabilityInput } from '../../../shared/domain';
import { capabilityPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { ResourceView } from '../assets/ResourceView';

interface CapabilityEditorProps {
  initialValue?: CapabilityInput;
  onClose: () => void;
  onSave: (input: CapabilityInput) => Promise<void>;
  open: boolean;
}

interface CapabilityDraft {
  name: string;
  frequency: string;
  evidence: string;
  gaps: string;
  mergedIntoId: string | null;
}

function draft(value?: CapabilityInput): CapabilityDraft {
  return {
    name: value?.name ?? '',
    frequency: String(value?.jdFrequency ?? 0),
    evidence: value?.evidence ?? '',
    gaps: value?.gaps ?? '',
    mergedIntoId: value?.mergedIntoId ?? null,
  };
}

function CapabilityEditor({ initialValue, onClose, onSave, open }: CapabilityEditorProps) {
  const [value, setValue] = useState(() => draft(initialValue));
  const [errors, setErrors] = useState<{ name?: string; frequency?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(draft(initialValue));
    setErrors({});
    setSaving(false);
  }, [initialValue, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsed = capabilityPayloadSchema.safeParse({
      name: value.name,
      jdFrequency: Number(value.frequency),
      evidence: value.evidence,
      gaps: value.gaps,
      mergedIntoId: value.mergedIntoId,
    });
    if (!parsed.success) {
      setErrors({
        name: value.name.trim() ? undefined : '请输入能力名称',
        frequency: Number.isInteger(Number(value.frequency)) && Number(value.frequency) >= 0
          ? undefined
          : '请输入非负整数',
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      // Keep draft in place for a safe retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      footer={(
        <>
          <button className="button button--quiet" disabled={saving} onClick={onClose} type="button">取消</button>
          <button className="button button--primary" disabled={saving} form="capability-editor-form" type="submit">
            {saving ? '保存中…' : '保存能力'}
          </button>
        </>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={initialValue ? '编辑能力' : '新增能力'}
    >
      <form className="editor-form" id="capability-editor-form" noValidate onSubmit={submit}>
        <Field error={errors.name} label="能力名称" required>
          <input
            maxLength={200}
            onChange={(event) => {
              setValue((current) => ({ ...current, name: event.target.value }));
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            value={value.name}
          />
        </Field>
        <Field error={errors.frequency} hint="只记录该能力在已分析 JD 中的实际出现次数。" label="JD 频次" required>
          <input
            min={0}
            onChange={(event) => {
              setValue((current) => ({ ...current, frequency: event.target.value }));
              setErrors((current) => ({ ...current, frequency: undefined }));
            }}
            step={1}
            type="number"
            value={value.frequency}
          />
        </Field>
        <Field label="已有证据">
          <textarea
            maxLength={40_000}
            onChange={(event) => setValue((current) => ({ ...current, evidence: event.target.value }))}
            rows={6}
            value={value.evidence}
          />
        </Field>
        <Field label="差距">
          <textarea
            maxLength={40_000}
            onChange={(event) => setValue((current) => ({ ...current, gaps: event.target.value }))}
            rows={6}
            value={value.gaps}
          />
        </Field>
      </form>
    </Modal>
  );
}

export function CapabilitiesPanel() {
  const resource = useAsyncResource(() => window.jobSearch.assets.capabilities.list());
  const [editing, setEditing] = useState<Capability | null | undefined>(undefined);
  const toast = useToast();
  const capabilities = resource.data ?? [];

  const save = async (input: CapabilityInput) => {
    try {
      await window.jobSearch.assets.capabilities.save({
        ...input,
        ...(editing ? { id: editing.id } : {}),
      });
      setEditing(undefined);
      await resource.reload();
      toast.success('能力主题已保存');
    } catch {
      toast.error('保存能力失败，请稍后重试');
      throw new Error('capability save failed');
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      新增能力
    </button>
  );

  return (
    <div className="assets-page capabilities-page">
      <header className="page-heading">
        <div>
          <p className="section-label">CAPABILITY INDEX / 能力索引</p>
          <h2>能力要有频次，也要有证据</h2>
          <p>把 JD 中反复出现的要求，与自己已有的证据和仍需补齐的差距放在同一张卡片上。</p>
        </div>
        {addButton}
      </header>
      <ResourceView
        empty={capabilities.length === 0}
        emptyAction={addButton}
        emptyBody="先手动记录一个反复出现的能力主题。AI 分析将在后续任务中经确认后提出建议。"
        emptyTitle="还没有能力主题"
        error={resource.error}
        errorTitle="能力主题载入失败"
        loading={resource.loading}
        loadingLabel="正在读取能力主题…"
      >
        <section aria-label="能力主题" className="capability-grid">
          {capabilities.map((capability) => (
            <article className="capability-card" key={capability.id}>
              <div className="capability-card__topline">
                <span>JD 频次 {capability.jdFrequency}</span>
                <button
                  aria-label={`编辑能力 ${capability.name}`}
                  className="text-button"
                  onClick={() => setEditing(capability)}
                  type="button"
                >
                  编辑
                </button>
              </div>
              <h3 className="user-text">{capability.name}</h3>
              <div>
                <h4>已有证据</h4>
                <p className="user-text">{capability.evidence || '—'}</p>
              </div>
              <div>
                <h4>差距</h4>
                <p className="user-text">{capability.gaps || '—'}</p>
              </div>
            </article>
          ))}
        </section>
      </ResourceView>
      <CapabilityEditor
        initialValue={editing ?? undefined}
        onClose={() => setEditing(undefined)}
        onSave={save}
        open={editing !== undefined}
      />
    </div>
  );
}
