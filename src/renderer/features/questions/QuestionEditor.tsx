import { type FormEvent, useEffect, useState } from 'react';
import type {
  Capability,
  Project,
  QuestionInput,
  QuestionType,
} from '../../../shared/domain';
import { questionPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface QuestionEditorProps {
  capabilities: Capability[];
  initialValue?: QuestionInput;
  onClose: () => void;
  onSave: (input: QuestionInput) => Promise<void>;
  open: boolean;
  projects: Project[];
  type: QuestionType;
}

type QuestionErrors = Partial<Record<'text' | 'occurrenceCount', string>>;

function emptyQuestion(type: QuestionType): QuestionInput {
  return {
    type,
    text: '',
    answerDraft: '',
    projectIds: [],
    capabilityIds: [],
    occurrenceCount: 0,
    status: 'active',
  };
}

function editorTitle(type: QuestionType, editing: boolean): string {
  if (type === 'interviewer') return editing ? '编辑面试官问题' : '新增面试官问题';
  return editing ? '编辑候选人反问' : '新增候选人反问';
}

export function QuestionEditor({
  capabilities,
  initialValue,
  onClose,
  onSave,
  open,
  projects,
  type,
}: QuestionEditorProps) {
  const [value, setValue] = useState<QuestionInput>(initialValue ?? emptyQuestion(type));
  const [countValue, setCountValue] = useState(String(initialValue?.occurrenceCount ?? 0));
  const [errors, setErrors] = useState<QuestionErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initialValue ?? emptyQuestion(type);
    setValue({ ...next, type });
    setCountValue(String(next.occurrenceCount));
    setErrors({});
    setSaving(false);
  }, [initialValue, open, type]);

  const toggle = (key: 'projectIds' | 'capabilityIds', id: string) => {
    setValue((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((item) => item !== id)
        : [...current[key], id],
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const occurrenceCount = Number(countValue);
    const parsed = questionPayloadSchema.safeParse({ ...value, occurrenceCount, type });
    if (!parsed.success) {
      setErrors({
        text: value.text.trim() ? undefined : '请输入问题文本',
        occurrenceCount: Number.isInteger(occurrenceCount) && occurrenceCount >= 0
          ? undefined
          : '请输入非负整数',
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      // Parent reports a safe error while this component keeps user input.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      dismissal="close-button-only"
      footer={(
        <button className="button button--primary" disabled={saving} form="question-editor-form" type="submit">
          {saving ? '保存中…' : '保存问题'}
        </button>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={editorTitle(type, Boolean(initialValue))}
    >
      <form className="editor-form" id="question-editor-form" noValidate onSubmit={submit}>
        <Field error={errors.text} label="问题文本" required>
          <textarea
            maxLength={20_000}
            onChange={(event) => {
              setValue((current) => ({ ...current, text: event.target.value }));
              setErrors((current) => ({ ...current, text: undefined }));
            }}
            rows={4}
            value={value.text}
          />
        </Field>
        <Field label="回答草稿">
          <textarea
            maxLength={40_000}
            onChange={(event) => setValue((current) => ({
              ...current,
              answerDraft: event.target.value,
            }))}
            rows={7}
            value={value.answerDraft}
          />
        </Field>
        <Field error={errors.occurrenceCount} hint="只记录实际遇到的次数。" label="出现次数" required>
          <input
            min={0}
            onChange={(event) => {
              setCountValue(event.target.value);
              setErrors((current) => ({ ...current, occurrenceCount: undefined }));
            }}
            step={1}
            type="number"
            value={countValue}
          />
        </Field>
        <div className="link-picker-grid">
          <fieldset className="link-picker">
            <legend>关联项目</legend>
            {projects.length === 0 ? <p>暂无项目可关联</p> : projects.map((project) => (
              <label key={project.id}>
                <input
                  aria-label={`关联项目：${project.name}`}
                  checked={value.projectIds.includes(project.id)}
                  onChange={() => toggle('projectIds', project.id)}
                  type="checkbox"
                />
                <span>{project.name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="link-picker">
            <legend>关联能力</legend>
            {capabilities.length === 0 ? <p>暂无能力可关联</p> : capabilities.map((capability) => (
              <label key={capability.id}>
                <input
                  aria-label={`关联能力：${capability.name}`}
                  checked={value.capabilityIds.includes(capability.id)}
                  onChange={() => toggle('capabilityIds', capability.id)}
                  type="checkbox"
                />
                <span>{capability.name}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </form>
    </Modal>
  );
}
