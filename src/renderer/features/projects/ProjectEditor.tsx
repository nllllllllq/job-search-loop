import { type FormEvent, useEffect, useState } from 'react';
import type { ProjectInput } from '../../../shared/domain';
import { projectPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface ProjectEditorProps {
  dialogTitle?: string;
  initialValue?: ProjectInput;
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
  open: boolean;
  submitLabel?: string;
}

type ProjectErrors = Partial<Record<keyof ProjectInput, string>>;

const emptyProject: ProjectInput = {
  name: '',
  projectTime: '',
  background: '',
  goal: '',
  role: '',
  keyDecisions: '',
  outcome: '',
  evidence: '',
  reflections: '',
  storytellingVersions: '',
  unclassifiedNotes: '',
};

export function ProjectEditor({
  dialogTitle,
  initialValue,
  onClose,
  onSave,
  open,
  submitLabel,
}: ProjectEditorProps) {
  const [value, setValue] = useState<ProjectInput>(initialValue ?? emptyProject);
  const [errors, setErrors] = useState<ProjectErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue
      ? {
        ...initialValue,
        projectTime: initialValue.projectTime ?? '',
        unclassifiedNotes: initialValue.unclassifiedNotes ?? '',
      }
      : emptyProject);
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

  const title = dialogTitle ?? (initialValue ? '编辑项目' : '新增项目');
  const actionLabel = submitLabel ?? '保存项目';

  return (
    <Modal
      dismissal="close-button-only"
      footer={(
        <button className="button button--primary" disabled={saving} form="project-editor-form" type="submit">
          {saving ? '保存中…' : actionLabel}
        </button>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={title}
    >
      <form className="editor-form" id="project-editor-form" noValidate onSubmit={submit}>
        <Field error={errors.name} label="项目名称" required>
          <input
            maxLength={200}
            onChange={(event) => change('name', event.target.value)}
            value={value.name}
          />
        </Field>
        <Field error={errors.role} label="项目角色">
          <textarea
            maxLength={20_000}
            onChange={(event) => change('role', event.target.value)}
            rows={3}
            value={value.role}
          />
        </Field>
        <Field error={errors.projectTime} label="项目时间">
          <input
            maxLength={200}
            onChange={(event) => change('projectTime', event.target.value)}
            value={value.projectTime ?? ''}
          />
        </Field>
        <Field
          error={errors.unclassifiedNotes}
          hint="保留项目原始内容；AI 整理不会覆盖这段原文。"
          label="项目内容"
        >
          <textarea
            maxLength={100_000}
            onChange={(event) => change('unclassifiedNotes', event.target.value)}
            rows={10}
            value={value.unclassifiedNotes ?? ''}
          />
        </Field>
      </form>
    </Modal>
  );
}
