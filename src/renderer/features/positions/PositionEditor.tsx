import { type FormEvent, useEffect, useState } from 'react';
import type { PositionInput } from '../../../shared/domain';
import { positionInputSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface PositionEditorProps {
  initialValue?: PositionInput;
  onClose: () => void;
  onSave: (input: PositionInput) => Promise<void>;
  open: boolean;
}

type PositionErrors = Partial<Record<keyof PositionInput, string>>;

const emptyValue: PositionInput = {
  company: '',
  title: '',
  location: '',
  interest: 3,
  rawJd: '',
};

function validationMessage(field: keyof PositionInput): string {
  if (field === 'company' || field === 'title') return '请输入 1–120 个字符';
  if (field === 'rawJd') return '请输入原始 JD';
  return '兴趣度应为 1–5 的整数';
}

export function PositionEditor({
  initialValue,
  onClose,
  onSave,
  open,
}: PositionEditorProps) {
  const [value, setValue] = useState<PositionInput>(initialValue ?? emptyValue);
  const [errors, setErrors] = useState<PositionErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue ?? emptyValue);
    setErrors({});
    setSaving(false);
  }, [initialValue, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const result = positionInputSchema.safeParse(value);
    if (!result.success) {
      const nextErrors: PositionErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          (field === 'company'
            || field === 'title'
            || field === 'location'
            || field === 'interest'
            || field === 'rawJd')
          && !nextErrors[field]
        ) {
          nextErrors[field] = validationMessage(field);
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave(result.data);
    } catch {
      // The parent surfaces a safe toast; keeping this editor mounted preserves
      // the user's in-progress values for a retry.
    } finally {
      setSaving(false);
    }
  };

  const clearError = (field: keyof PositionInput) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <Modal
      dismissal="close-button-only"
      footer={
        <button className="button button--primary" disabled={saving} form="position-editor-form" type="submit">
          {saving ? '保存中…' : '保存岗位'}
        </button>
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={initialValue ? '编辑岗位' : '录入岗位'}
    >
      <form className="editor-form" id="position-editor-form" noValidate onSubmit={submit}>
        <div className="editor-form__grid">
          <Field error={errors.company} label="公司" required>
            <input
              maxLength={120}
              onChange={(event) => {
                setValue((current) => ({ ...current, company: event.target.value }));
                clearError('company');
              }}
              type="text"
              value={value.company}
            />
          </Field>
          <Field error={errors.title} label="岗位名称" required>
            <input
              maxLength={120}
              onChange={(event) => {
                setValue((current) => ({ ...current, title: event.target.value }));
                clearError('title');
              }}
              type="text"
              value={value.title}
            />
          </Field>
        </div>
        <div className="editor-form__grid">
          <Field error={errors.location} hint="城市、区域或远程方式均可" label="位置">
            <input
              maxLength={200}
              onChange={(event) => {
                setValue((current) => ({ ...current, location: event.target.value }));
                clearError('location');
              }}
              placeholder="例如：上海 · 混合办公"
              type="text"
              value={value.location ?? ''}
            />
          </Field>
          <Field error={errors.interest} hint="1 表示观望，5 表示重点跟进。" label="兴趣度" required>
            <select
              onChange={(event) => {
                setValue((current) => ({
                  ...current,
                  interest: Number(event.target.value) as PositionInput['interest'],
                }));
                clearError('interest');
              }}
              value={value.interest}
            >
              {[1, 2, 3, 4, 5].map((interest) => (
                <option key={interest} value={interest}>{interest}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          error={errors.rawJd}
          hint="保留招聘页面中的原始文字与换行，最多 100,000 字。"
          label="原始 JD"
          required
        >
          <textarea
            maxLength={100_000}
            onChange={(event) => {
              setValue((current) => ({ ...current, rawJd: event.target.value }));
              clearError('rawJd');
            }}
            rows={12}
            value={value.rawJd}
          />
        </Field>
      </form>
    </Modal>
  );
}
