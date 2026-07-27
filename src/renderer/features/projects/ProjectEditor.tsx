import { type FormEvent, useEffect, useState } from 'react';
import type { ProjectInput } from '../../../shared/domain';
import { projectPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface ProjectEditorProps {
  initialValue?: ProjectInput;
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
  open: boolean;
}

type ProjectErrors = Partial<Record<keyof ProjectInput, string>>;

const emptyProject: ProjectInput = {
  name: '',
  background: '',
  goal: '',
  role: '',
  keyDecisions: '',
  outcome: '',
  evidence: '',
  reflections: '',
};

const fields: Array<{
  key: keyof ProjectInput;
  label: string;
  limit: number;
  rows: number;
}> = [
  { key: 'background', label: '背景', limit: 20_000, rows: 4 },
  { key: 'goal', label: '目标', limit: 20_000, rows: 3 },
  { key: 'role', label: '角色', limit: 20_000, rows: 3 },
  { key: 'keyDecisions', label: '关键决策', limit: 40_000, rows: 5 },
  { key: 'outcome', label: '结果', limit: 40_000, rows: 4 },
  { key: 'evidence', label: '证据', limit: 40_000, rows: 4 },
  { key: 'reflections', label: '反思', limit: 20_000, rows: 4 },
];

export function ProjectEditor({
  initialValue,
  onClose,
  onSave,
  open,
}: ProjectEditorProps) {
  const [value, setValue] = useState<ProjectInput>(initialValue ?? emptyProject);
  const [errors, setErrors] = useState<ProjectErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue ?? emptyProject);
    setErrors({});
    setSaving(false);
  }, [initialValue, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsed = projectPayloadSchema.safeParse(value);
    if (!parsed.success) {
      const next: ProjectErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && key in value) {
          next[key as keyof ProjectInput] = key === 'name'
            ? '请输入 1–200 个字符'
            : '内容超过允许长度';
        }
      }
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      // Parent owns the safe toast; keeping the modal open preserves all input.
    } finally {
      setSaving(false);
    }
  };

  const change = (key: keyof ProjectInput, nextValue: string) => {
    setValue((current) => ({ ...current, [key]: nextValue }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Modal
      footer={(
        <>
          <button className="button button--quiet" disabled={saving} onClick={onClose} type="button">
            取消
          </button>
          <button className="button button--primary" disabled={saving} form="project-editor-form" type="submit">
            {saving ? '保存中…' : '保存项目'}
          </button>
        </>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={initialValue ? '编辑项目' : '新增项目'}
    >
      <form className="editor-form" id="project-editor-form" noValidate onSubmit={submit}>
        <Field error={errors.name} label="项目名称" required>
          <input
            maxLength={200}
            onChange={(event) => change('name', event.target.value)}
            value={value.name}
          />
        </Field>
        {fields.map((field) => (
          <Field error={errors[field.key]} key={field.key} label={field.label}>
            <textarea
              maxLength={field.limit}
              onChange={(event) => change(field.key, event.target.value)}
              rows={field.rows}
              value={value[field.key]}
            />
          </Field>
        ))}
      </form>
    </Modal>
  );
}
