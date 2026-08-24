import { type FormEvent, useEffect, useState } from 'react';
import type {
  Insight,
  InsightInput,
  InterviewReviewReusableItem,
} from '../../../shared/domain';
import { insightPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';

export type InsightReviewReusableItem = Omit<InterviewReviewReusableItem, 'targetType'> & {
  targetType: 'insight';
};

export interface ReviewToInsightEditorProps {
  item: InsightReviewReusableItem;
  onClose: () => void;
  onSaved: (insight: Insight) => void | Promise<void>;
  open: boolean;
  positionId: string;
}

interface InsightDraft {
  title: string;
  content: string;
}

function toDraft(item: InsightReviewReusableItem): InsightDraft {
  return { title: item.title, content: item.content };
}

export function ReviewToInsightEditor({
  item,
  onClose,
  onSaved,
  open,
  positionId,
}: ReviewToInsightEditorProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<InsightDraft>(() => toDraft(item));
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(item));
    setErrors({});
    setSaving(false);
  }, [item, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const input: InsightInput = {
      title: draft.title,
      content: draft.content,
      positionId,
      projectId: null,
      questionId: null,
      capabilityId: null,
    };
    const parsed = insightPayloadSchema.safeParse(input);
    if (!parsed.success) {
      setErrors({
        title: draft.title.trim() ? undefined : '请输入标题',
        content: draft.content.trim() ? undefined : '请输入自由文本',
      });
      return;
    }

    setSaving(true);
    try {
      let saved: Insight;
      try {
        saved = await window.jobSearch.assets.insights.save(parsed.data);
      } catch {
        toast.error('保存心得失败，请稍后重试');
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
          form="review-to-insight-form"
          type="submit"
        >
          {saving ? '保存中…' : '确认纳入心得'}
        </button>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title="纳入心得"
    >
      <form className="editor-form" id="review-to-insight-form" noValidate onSubmit={submit}>
        <Field error={errors.title} label="标题" required>
          <input
            maxLength={200}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value }));
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            value={draft.title}
          />
        </Field>
        <Field error={errors.content} label="自由文本" required>
          <textarea
            maxLength={40_000}
            onChange={(event) => {
              setDraft((current) => ({ ...current, content: event.target.value }));
              setErrors((current) => ({ ...current, content: undefined }));
            }}
            rows={10}
            value={draft.content}
          />
        </Field>
      </form>
    </Modal>
  );
}
