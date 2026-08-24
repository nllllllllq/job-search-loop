import { type FormEvent, useState } from 'react';
import type { PromptKind, PromptTemplate } from '../../../shared/domain';
import { Field } from '../../components/Field';
import { useToast } from '../../hooks/useToast';

interface PromptTemplatesSectionProps {
  prompts: PromptTemplate[];
  onSaved: (prompt: PromptTemplate) => void;
}

const promptOrder: PromptKind[] = [
  'preparation',
  'interview-review',
  'capability-analysis',
  'project-import',
  'position-image',
];

export function PromptTemplatesSection({
  prompts,
  onSaved,
}: PromptTemplatesSectionProps) {
  const toast = useToast();
  const [values, setValues] = useState<Record<PromptKind, string>>(() => ({
    preparation: prompts.find((prompt) => prompt.kind === 'preparation')?.content ?? '',
    'interview-review': prompts.find(
      (prompt) => prompt.kind === 'interview-review',
    )?.content ?? '',
    'capability-analysis': prompts.find(
      (prompt) => prompt.kind === 'capability-analysis',
    )?.content ?? '',
    'project-import': prompts.find(
      (prompt) => prompt.kind === 'project-import',
    )?.content ?? '',
    'position-image': prompts.find(
      (prompt) => prompt.kind === 'position-image',
    )?.content ?? '',
  }));
  const [saving, setSaving] = useState<PromptKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PromptKind, string>>>({});

  const save = async (
    event: FormEvent<HTMLFormElement>,
    prompt: PromptTemplate,
  ) => {
    event.preventDefault();
    if (saving !== null) return;
    const content = values[prompt.kind];
    if (content.trim().length === 0) {
      setErrors((current) => ({
        ...current,
        [prompt.kind]: '模板内容不能为空。',
      }));
      return;
    }

    setSaving(prompt.kind);
    setErrors((current) => ({ ...current, [prompt.kind]: undefined }));
    try {
      const saved = await window.jobSearch.assets.prompts.save(
        prompt.kind,
        content,
      );
      onSaved(saved);
      toast.success(`${prompt.name}模板已保存`);
    } catch {
      setErrors((current) => ({
        ...current,
        [prompt.kind]: '模板保存失败，请稍后重试。',
      }));
      toast.error('模板保存失败，请稍后重试。');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section
      aria-labelledby="prompt-templates-title"
      className="settings-section settings-section--prompts"
    >
      <div className="settings-section__heading">
        <div>
          <p className="section-label">WORKING INSTRUCTIONS / 工作指令</p>
          <h3 id="prompt-templates-title">Prompt 模板</h3>
        </div>
        <p>模板会按生成当时的原文保存快照；这里的空格与换行不会被改写。</p>
      </div>
      <div className="prompt-template-grid">
        {promptOrder.map((kind, index) => {
          const prompt = prompts.find((item) => item.kind === kind);
          if (!prompt) return null;
          const isSaving = saving === kind;
          return (
            <form
              className="prompt-template-card"
              key={kind}
              onSubmit={(event) => void save(event, prompt)}
            >
              <div className="prompt-template-card__folio" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </div>
              <Field
                error={errors[kind]}
                label={`${prompt.name}模板`}
                required
              >
                <textarea
                  maxLength={200_000}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      [kind]: event.target.value,
                    }));
                    setErrors((current) => ({
                      ...current,
                      [kind]: undefined,
                    }));
                  }}
                  rows={8}
                  value={values[kind]}
                />
              </Field>
              <button
                className="button button--quiet"
                disabled={saving !== null}
                type="submit"
              >
                {isSaving ? '保存中…' : `保存${prompt.name}模板`}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
