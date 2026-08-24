import { type FormEvent, useEffect, useState } from 'react';
import type { Interview } from '../../../shared/domain';
import type { InterviewEditInput } from '../../../shared/ipc';
import { interviewInputSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface InterviewEditorProps {
  initialValue?: Interview;
  open: boolean;
  positionId: string;
  stageId?: string | null;
  onClose: () => void;
  onSave: (input: InterviewEditInput) => Promise<void>;
}

interface FormValue {
  roundName: string;
  interviewDate: string;
  transcript: string;
  personalNotes: string;
  feedbackResult: string;
}

type Errors = Partial<Record<keyof FormValue | 'form', string>>;

function formValue(interview?: Interview): FormValue {
  return {
    roundName: interview?.roundName ?? '',
    interviewDate: interview?.interviewDate ?? '',
    transcript: interview?.transcript ?? '',
    personalNotes: interview?.personalNotes ?? '',
    feedbackResult: interview?.feedbackResult ?? '',
  };
}

export function InterviewEditor({
  initialValue,
  open,
  positionId,
  stageId = null,
  onClose,
  onSave,
}: InterviewEditorProps) {
  const [value, setValue] = useState(() => formValue(initialValue));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(formValue(initialValue));
    setErrors({});
    setSaving(false);
  }, [initialValue, open]);

  const setField = (field: keyof FormValue, next: string) => {
    setValue((current) => ({ ...current, [field]: next }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const input: InterviewEditInput = {
      positionId,
      stageId: initialValue?.stageId ?? stageId,
      roundName: value.roundName,
      interviewDate: value.interviewDate || null,
      transcript: value.transcript,
      personalNotes: value.personalNotes,
      feedbackResult: value.feedbackResult || null,
    };
    const parsed = interviewInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'interviewDate') next.interviewDate = '请输入真实存在的日期。';
        if (field === 'roundName') next.roundName = '请输入 1–120 个字符。';
        if (field === 'transcript') next.transcript = '请输入已确认的面试文字记录。';
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setErrors((current) => ({
        ...current,
        form: '保存失败，已保留你填写的内容。',
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      closeDisabled={saving}
      dismissal="close-button-only"
      footer={(
        <button className="button button--primary" disabled={saving} form="interview-editor" type="submit">
          {saving ? '保存中…' : '保存面试记录'}
        </button>
      )}
      onClose={onClose}
      open={open}
      title={initialValue ? '编辑面试记录' : '新增面试记录'}
    >
      <form className="editor-form" id="interview-editor" noValidate onSubmit={submit}>
        {errors.form ? <p className="form-error" role="alert">{errors.form}</p> : null}
        <div className="editor-form__grid">
          <Field error={errors.roundName} label="轮次" required>
            <input
              maxLength={120}
              onChange={(event) => setField('roundName', event.target.value)}
              value={value.roundName}
            />
          </Field>
          <Field
            error={errors.interviewDate}
            hint="日期仅用于记录流程，不会创建提醒。"
            label="面试日期"
          >
            <input
              inputMode="numeric"
              onChange={(event) => setField('interviewDate', event.target.value)}
              placeholder="YYYY-MM-DD"
              value={value.interviewDate}
            />
          </Field>
        </div>
        <Field
          error={errors.transcript}
          hint="当前版本仅支持手动输入；请粘贴或整理已经确认的文字。"
          label="已确认文字记录"
          required
        >
          <textarea
            maxLength={1_000_000}
            onChange={(event) => setField('transcript', event.target.value)}
            rows={10}
            value={value.transcript}
          />
        </Field>
        <Field error={errors.personalNotes} label="个人感受 / 补充">
          <textarea
            maxLength={100_000}
            onChange={(event) => setField('personalNotes', event.target.value)}
            rows={5}
            value={value.personalNotes}
          />
        </Field>
        <Field error={errors.feedbackResult} label="后续结果 / 反馈">
          <textarea
            maxLength={20_000}
            onChange={(event) => setField('feedbackResult', event.target.value)}
            rows={4}
            value={value.feedbackResult}
          />
        </Field>
      </form>
    </Modal>
  );
}
