import { type FormEvent, useEffect, useState } from 'react';
import type {
  Capability,
  CapabilityInput,
  InterviewReviewReusableItem,
} from '../../../shared/domain';
import { capabilityPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';

export type CapabilityReviewReusableItem = Omit<InterviewReviewReusableItem, 'targetType'> & {
  targetType: 'capability';
};

export interface ReviewToCapabilityEditorProps {
  initialValue?: CapabilityInput;
  item: CapabilityReviewReusableItem;
  onClose: () => void;
  onSaved: (capability: Capability) => void | Promise<void>;
  open: boolean;
}

interface CapabilityDraft {
  name: string;
  jdFrequency: string;
  evidence: string;
  gaps: string;
  mergedIntoId: string | null;
}

function toDraft(
  item: CapabilityReviewReusableItem,
  initialValue?: CapabilityInput,
): CapabilityDraft {
  const source = initialValue ?? {
    name: item.title,
    jdFrequency: 0,
    evidence: item.content,
    gaps: '',
    mergedIntoId: null,
  };
  return {
    name: source.name,
    jdFrequency: String(source.jdFrequency),
    evidence: source.evidence,
    gaps: source.gaps,
    mergedIntoId: source.mergedIntoId,
  };
}

export function ReviewToCapabilityEditor({
  initialValue,
  item,
  onClose,
  onSaved,
  open,
}: ReviewToCapabilityEditorProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<CapabilityDraft>(() => toDraft(item, initialValue));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(item, initialValue));
    setErrors({});
    setSaving(false);
  }, [initialValue, item, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const input: CapabilityInput = {
      name: draft.name,
      jdFrequency: Number(draft.jdFrequency),
      evidence: draft.evidence,
      gaps: draft.gaps,
      mergedIntoId: draft.mergedIntoId,
    };
    const parsed = capabilityPayloadSchema.safeParse(input);
    if (!parsed.success) {
      const nextErrors: Record<string, string | undefined> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0] ?? 'form')] = issue.message;
      }
      if (
        draft.jdFrequency.trim() === ''
        || !Number.isInteger(Number(draft.jdFrequency))
        || Number(draft.jdFrequency) < 0
      ) {
        nextErrors.jdFrequency = '请输入非负整数';
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      let saved: Capability;
      try {
        saved = await window.jobSearch.assets.capabilities.save(parsed.data);
      } catch {
        toast.error('保存能力失败，请稍后重试');
        return;
      }
      await onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      closeDisabled={saving}
      dismissal="close-button-only"
      footer={(
        <button
          className="button button--primary"
          disabled={saving}
          form="review-to-capability-form"
          type="submit"
        >
          {saving ? '保存中…' : '确认纳入能力'}
        </button>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title="纳入能力"
    >
      <form className="editor-form" id="review-to-capability-form" noValidate onSubmit={submit}>
        <Field error={errors.name} label="能力名称" required>
          <input
            maxLength={200}
            onChange={(event) => {
              setDraft((current) => ({ ...current, name: event.target.value }));
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            value={draft.name}
          />
        </Field>
        <Field error={errors.jdFrequency} label="JD 频次" required>
          <input
            min={0}
            onChange={(event) => {
              setDraft((current) => ({ ...current, jdFrequency: event.target.value }));
              setErrors((current) => ({ ...current, jdFrequency: undefined }));
            }}
            step={1}
            type="number"
            value={draft.jdFrequency}
          />
        </Field>
        <Field label="已有证据">
          <textarea
            maxLength={40_000}
            onChange={(event) => setDraft((current) => ({ ...current, evidence: event.target.value }))}
            rows={6}
            value={draft.evidence}
          />
        </Field>
        <Field label="差距">
          <textarea
            maxLength={40_000}
            onChange={(event) => setDraft((current) => ({ ...current, gaps: event.target.value }))}
            rows={4}
            value={draft.gaps}
          />
        </Field>
      </form>
    </Modal>
  );
}
