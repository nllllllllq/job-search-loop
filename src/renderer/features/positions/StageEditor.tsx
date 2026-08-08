import { type FormEvent, useEffect, useState } from 'react';
import type { CanonicalStage, ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { processStageInputSchema } from '../../../shared/schemas';
import { stageDatePolicy } from '../../../shared/stage-policy';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface StageEditorProps {
  initialValue?: ProcessStage;
  onClose: () => void;
  onSave: (input: ProcessStageInput & { id?: string }) => Promise<void>;
  open: boolean;
  positionId: string;
  stageCount: number;
}

interface StageFormValue {
  actualDate: string;
  canonicalStage: CanonicalStage;
  expectedDate: string;
  feedback: string;
  name: string;
  notes: string;
  orderIndex: string;
}

type StageErrors = Partial<Record<keyof StageFormValue, string>>;

const canonicalOptions: Array<{ label: string; value: CanonicalStage }> = [
  { label: '感兴趣', value: 'interested' },
  { label: '已投递', value: 'applied' },
  { label: '测评', value: 'assessment' },
  { label: '面试', value: 'interview' },
  { label: '录用', value: 'offer' },
  { label: '未通过', value: 'rejected' },
  { label: '已撤回', value: 'withdrawn' },
];

function localIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toFormValue(stage: ProcessStage | undefined, stageCount: number): StageFormValue {
  const canonicalStage = stage?.canonicalStage ?? 'interested';
  const policy = stageDatePolicy(canonicalStage);
  return {
    name: stage?.name ?? '',
    canonicalStage,
    actualDate: stage?.actualDate ?? (policy.kind === 'single' && policy.autoToday ? localIsoDate() : ''),
    expectedDate: stage?.expectedDate ?? '',
    feedback: stage?.feedback ?? '',
    notes: stage?.notes ?? '',
    orderIndex: String((stage?.orderIndex ?? stageCount) + 1),
  };
}

export function StageEditor({
  initialValue,
  onClose,
  onSave,
  open,
  positionId,
  stageCount,
}: StageEditorProps) {
  const [value, setValue] = useState(() => toFormValue(initialValue, stageCount));
  const [errors, setErrors] = useState<StageErrors>({});
  const [saving, setSaving] = useState(false);
  const datePolicy = stageDatePolicy(value.canonicalStage);

  useEffect(() => {
    if (!open) return;
    setValue(toFormValue(initialValue, stageCount));
    setErrors({});
    setSaving(false);
  }, [initialValue, stageCount, open]);

  const setField = <K extends keyof StageFormValue>(field: K, nextValue: StageFormValue[K]) => {
    setValue((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (value.orderIndex.trim() === '') {
      setErrors((current) => ({ ...current, orderIndex: '请输入有效的显示顺序' }));
      return;
    }
    const displayOrder = Number(value.orderIndex);
    const maximumOrder = initialValue ? stageCount : stageCount + 1;
    if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > maximumOrder) {
      setErrors((current) => ({ ...current, orderIndex: '请输入有效的显示顺序' }));
      return;
    }

    const input: ProcessStageInput = {
      positionId,
      name: value.name,
      canonicalStage: value.canonicalStage,
      actualDate: value.actualDate || null,
      expectedDate: datePolicy.kind === 'notice-and-event' ? value.expectedDate || null : null,
      feedback: value.feedback,
      notes: value.notes,
      orderIndex: displayOrder - 1,
    };
    const parsed = processStageInputSchema.safeParse(input);
    if (!parsed.success) {
      const nextErrors: StageErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && field in value) {
          nextErrors[field as keyof StageFormValue] = field === 'name'
            ? '请输入 1–120 个字符'
            : issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...parsed.data, ...(initialValue ? { id: initialValue.id } : {}) });
    } catch {
      // Mutation feedback is owned by the timeline; keep entered values visible.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      closeDisabled={saving}
      footer={(
        <>
          <button className="button button--quiet" disabled={saving} onClick={onClose} type="button">取消</button>
          <button className="button button--primary" disabled={saving} form="stage-editor-form" type="submit">
            {saving ? '保存中…' : '保存阶段'}
          </button>
        </>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={initialValue ? '编辑流程阶段' : '新增流程阶段'}
    >
      <form className="editor-form" id="stage-editor-form" noValidate onSubmit={submit}>
        <div className="editor-form__grid">
          <Field error={errors.name} label="阶段名称" required>
            <input maxLength={120} onChange={(event) => setField('name', event.target.value)} value={value.name} />
          </Field>
          <Field error={errors.canonicalStage} hint="用于统一筛选与状态展示。" label="标准阶段" required>
            <select onChange={(event) => {
              const canonicalStage = event.target.value as CanonicalStage;
              const policy = stageDatePolicy(canonicalStage);
              setValue((current) => {
                const previousPolicy = stageDatePolicy(current.canonicalStage);
                const seededToday = !initialValue
                  && previousPolicy.kind === 'single'
                  && previousPolicy.autoToday
                  && current.actualDate === localIsoDate();
                return {
                  ...current,
                  canonicalStage,
                  expectedDate: policy.kind === 'single' ? '' : current.expectedDate,
                  actualDate: seededToday
                    ? (policy.kind === 'single' && policy.autoToday ? localIsoDate() : '')
                    : current.actualDate || (policy.kind === 'single' && policy.autoToday ? localIsoDate() : ''),
                };
              });
              setErrors((current) => ({ ...current, canonicalStage: undefined }));
            }} value={value.canonicalStage}>
              {canonicalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {datePolicy.kind === 'notice-and-event' ? (
            <Field error={errors.expectedDate} label={datePolicy.expectedLabel}>
              <input onChange={(event) => setField('expectedDate', event.target.value)} type="date" value={value.expectedDate} />
            </Field>
          ) : null}
          <Field error={errors.actualDate} label={datePolicy.actualLabel}>
            <input onChange={(event) => setField('actualDate', event.target.value)} type="date" value={value.actualDate} />
          </Field>
          <Field error={errors.orderIndex} hint={`输入 1–${initialValue ? stageCount : stageCount + 1}。`} label="显示顺序" required>
            <input max={initialValue ? stageCount : stageCount + 1} min={1} onChange={(event) => setField('orderIndex', event.target.value)} step={1} type="number" value={value.orderIndex} />
          </Field>
        </div>
        <Field error={errors.feedback} label="反馈">
          <textarea maxLength={20_000} onChange={(event) => setField('feedback', event.target.value)} rows={4} value={value.feedback} />
        </Field>
        <Field error={errors.notes} label="备注">
          <textarea maxLength={20_000} onChange={(event) => setField('notes', event.target.value)} rows={4} value={value.notes} />
        </Field>
      </form>
    </Modal>
  );
}
