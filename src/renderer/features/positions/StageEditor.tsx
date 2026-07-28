import { type FormEvent, useEffect, useState } from 'react';
import type { CanonicalStage, ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { processStageInputSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

interface StageEditorProps {
  initialValue?: ProcessStage;
  onClose: () => void;
  onDelete: (stageId: string) => Promise<void>;
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

function toFormValue(stage: ProcessStage | undefined, stageCount: number): StageFormValue {
  return {
    name: stage?.name ?? '',
    canonicalStage: stage?.canonicalStage ?? 'interested',
    actualDate: stage?.actualDate ?? '',
    expectedDate: stage?.expectedDate ?? '',
    feedback: stage?.feedback ?? '',
    notes: stage?.notes ?? '',
    orderIndex: String((stage?.orderIndex ?? stageCount) + 1),
  };
}

export function StageEditor({
  initialValue,
  onClose,
  onDelete,
  onSave,
  open,
  positionId,
  stageCount,
}: StageEditorProps) {
  const [value, setValue] = useState(() => toFormValue(initialValue, stageCount));
  const [errors, setErrors] = useState<StageErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(toFormValue(initialValue, stageCount));
    setErrors({});
    setSaving(false);
    setDeleting(false);
    setConfirmingDelete(false);
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
      expectedDate: value.expectedDate || null,
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
          nextErrors[field as keyof StageFormValue] =
            field === 'name' ? '请输入 1–120 个字符' : issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...parsed.data,
        ...(initialValue ? { id: initialValue.id } : {}),
      });
    } catch {
      // Mutation feedback is owned by the timeline; the editor intentionally
      // remains open with the entered values.
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initialValue || deleting || saving) return;
    setDeleting(true);
    try {
      await onDelete(initialValue.id);
    } catch {
      // Mutation feedback is owned by the timeline; keep this confirmation open.
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;

  return (
    <Modal
      closeDisabled={busy}
      footer={
        confirmingDelete ? (
          <>
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              取消删除
            </button>
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() => void remove()}
              type="button"
            >
              {deleting ? '删除中…' : '永久删除节点'}
            </button>
          </>
        ) : (
          <>
            {initialValue ? (
              <button
                className="button button--danger"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
                type="button"
              >
                删除节点
              </button>
            ) : null}
            <button className="button button--quiet" disabled={busy} onClick={onClose} type="button">取消</button>
            <button className="button button--primary" disabled={busy} form="stage-editor-form" type="submit">
              {saving ? '保存中…' : '保存阶段'}
            </button>
          </>
        )
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      open={open}
      title={initialValue ? '编辑流程阶段' : '新增流程阶段'}
    >
      {confirmingDelete ? (
        <div className="stage-delete-confirmation" role="alert">
          <strong>永久删除“{initialValue?.name}”节点？</strong>
          <p>该节点的日期、反馈和备注会一起删除，此操作无法撤销。</p>
        </div>
      ) : null}
      <form className="editor-form" id="stage-editor-form" noValidate onSubmit={submit}>
        <div className="editor-form__grid">
          <Field error={errors.name} label="阶段名称" required>
            <input maxLength={120} onChange={(event) => setField('name', event.target.value)} value={value.name} />
          </Field>
          <Field error={errors.canonicalStage} hint="用于统一筛选与状态展示。" label="标准阶段" required>
            <select onChange={(event) => setField('canonicalStage', event.target.value as CanonicalStage)} value={value.canonicalStage}>
              {canonicalOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field error={errors.actualDate} label="实际日期">
            <input onChange={(event) => setField('actualDate', event.target.value)} type="date" value={value.actualDate} />
          </Field>
          <Field error={errors.expectedDate} label="预计日期">
            <input onChange={(event) => setField('expectedDate', event.target.value)} type="date" value={value.expectedDate} />
          </Field>
          <Field error={errors.orderIndex} hint={`输入 1–${initialValue ? stageCount : stageCount + 1}。`} label="显示顺序" required>
            <input
              max={initialValue ? stageCount : stageCount + 1}
              min={1}
              onChange={(event) => setField('orderIndex', event.target.value)}
              step={1}
              type="number"
              value={value.orderIndex}
            />
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
