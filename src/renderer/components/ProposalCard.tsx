import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import type {
  Capability,
  ChangeProposal,
  ChangeProposalListItem,
  PositionListItem,
  Project,
  Question,
} from '../../shared/domain';
import {
  strictCapabilityProposalPayloadSchema,
  strictInsightProposalPayloadSchema,
  strictProjectProposalPayloadSchema,
  strictQuestionProposalPayloadSchema,
} from '../../shared/schemas';
import { Field } from './Field';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { useToast } from '../hooks/useToast';

export interface ProposalAssetOptions {
  capabilities: Capability[];
  positions: PositionListItem[];
  projects: Project[];
  questions: Question[];
}

interface ProposalCardProps {
  proposal: ChangeProposalListItem;
  onResolved: (proposal: ChangeProposal) => void;
  assetOptions?: ProposalAssetOptions;
}

const emptyOptions: ProposalAssetOptions = {
  capabilities: [],
  positions: [],
  projects: [],
  questions: [],
};

const targetLabels = {
  project: '项目档案',
  question: '问题库',
  capability: '能力主题',
  insight: '随想与心得',
} as const;

const operationLabels = {
  create: '新增',
  update: '更新',
  merge: '合并为最终版本',
} as const;

const projectFields = [
  ['name', '项目名称', 2, 200, true],
  ['background', '背景', 4, 20_000, false],
  ['goal', '目标', 4, 20_000, false],
  ['role', '角色', 4, 20_000, false],
  ['keyDecisions', '关键决策', 5, 40_000, false],
  ['outcome', '结果', 5, 40_000, false],
  ['evidence', '证据', 5, 40_000, false],
  ['reflections', '反思', 4, 20_000, false],
  ['storytellingVersions', '讲述版本', 5, 40_000, false],
  ['unclassifiedNotes', '待整理内容', 5, 100_000, false],
] as const;

function clonePayload(payload: unknown): Record<string, unknown> {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') return {};
  return structuredClone(payload as Record<string, unknown>);
}

function stringValue(draft: Record<string, unknown>, key: string): string {
  return typeof draft[key] === 'string' ? draft[key] : '';
}

function stringArrayValue(draft: Record<string, unknown>, key: string): string[] {
  return Array.isArray(draft[key])
    ? (draft[key] as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
}

function ProposalSummary({
  proposal,
  payload,
}: {
  proposal: ChangeProposalListItem;
  payload: unknown;
}) {
  const record = clonePayload(payload);
  const title = proposal.targetType === 'project'
    ? stringValue(record, 'name')
    : proposal.targetType === 'question'
      ? stringValue(record, 'text')
      : proposal.targetType === 'capability'
        ? stringValue(record, 'name')
        : stringValue(record, 'title');
  const detail = proposal.targetType === 'project'
    ? stringValue(record, 'goal')
    : proposal.targetType === 'question'
      ? stringValue(record, 'answerDraft')
      : proposal.targetType === 'capability'
        ? stringValue(record, 'evidence')
        : stringValue(record, 'content');
  return (
    <div className="proposal-payload proposal-payload--summary">
      <h4>{proposal.acceptedPayload ? '最终写入内容' : '建议内容'}</h4>
      <strong className="user-text">{title || '未命名内容'}</strong>
      {detail ? <p className="user-text">{detail}</p> : null}
      <details>
        <summary>高级 JSON 视图</summary>
        <pre className="user-text">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}

interface EditorFieldsProps {
  draft: Record<string, unknown>;
  errors: Record<string, string>;
  options: ProposalAssetOptions;
  proposal: ChangeProposalListItem;
  setField: (key: string, value: unknown) => void;
}

function RelationCheckboxes({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="proposal-relation-picker">
      <legend>{legend}</legend>
      {options.length === 0 ? <p>暂无可关联条目</p> : options.map((item) => (
        <label key={item.id}>
          <input
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
            type="checkbox"
          />
          <span>{item.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function OptionalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label}>
      <select onChange={(event) => onChange(event.target.value || null)} value={value ?? ''}>
        <option value="">不关联</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </Field>
  );
}

function EditorFields({
  draft,
  errors,
  options,
  proposal,
  setField,
}: EditorFieldsProps): ReactNode {
  if (proposal.targetType === 'project') {
    return projectFields.map(([key, label, rows, maxLength, required]) => (
      <Field error={errors[key]} key={key} label={label} required={required}>
        {key === 'name' ? (
          <input
            maxLength={maxLength}
            onChange={(event) => setField(key, event.target.value)}
            value={stringValue(draft, key)}
          />
        ) : (
          <textarea
            maxLength={maxLength}
            onChange={(event) => setField(key, event.target.value)}
            rows={rows}
            value={stringValue(draft, key)}
          />
        )}
      </Field>
    ));
  }

  if (proposal.targetType === 'question') {
    const projectIds = stringArrayValue(draft, 'projectIds');
    const capabilityIds = stringArrayValue(draft, 'capabilityIds');
    const toggle = (key: 'projectIds' | 'capabilityIds', id: string) => {
      const current = key === 'projectIds' ? projectIds : capabilityIds;
      setField(key, current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]);
    };
    return (
      <>
        <Field error={errors.type} label="问题类型" required>
          <select
            onChange={(event) => setField('type', event.target.value)}
            value={stringValue(draft, 'type')}
          >
            <option value="interviewer">面试官提问</option>
            <option value="candidate">候选人反问</option>
          </select>
        </Field>
        <Field error={errors.text} label="问题文本" required>
          <textarea
            maxLength={20_000}
            onChange={(event) => setField('text', event.target.value)}
            rows={4}
            value={stringValue(draft, 'text')}
          />
        </Field>
        <Field error={errors.answerDraft} label="回答草稿">
          <textarea
            maxLength={40_000}
            onChange={(event) => setField('answerDraft', event.target.value)}
            rows={5}
            value={stringValue(draft, 'answerDraft')}
          />
        </Field>
        <div className="proposal-editor__split">
          <Field error={errors.occurrenceCount} label="出现次数" required>
            <input
              min={0}
              onChange={(event) => setField('occurrenceCount', event.target.value)}
              step={1}
              type="number"
              value={String(draft.occurrenceCount ?? '')}
            />
          </Field>
          <Field error={errors.status} label="状态" required>
            <input
              maxLength={80}
              onChange={(event) => setField('status', event.target.value)}
              value={stringValue(draft, 'status')}
            />
          </Field>
        </div>
        <RelationCheckboxes
          legend="关联项目"
          onToggle={(id) => toggle('projectIds', id)}
          options={options.projects.map((item) => ({ id: item.id, label: item.name }))}
          selected={projectIds}
        />
        <RelationCheckboxes
          legend="关联能力"
          onToggle={(id) => toggle('capabilityIds', id)}
          options={options.capabilities.map((item) => ({ id: item.id, label: item.name }))}
          selected={capabilityIds}
        />
      </>
    );
  }

  if (proposal.targetType === 'capability') {
    return (
      <>
        {proposal.operation === 'merge' ? (
          <p className="form-note">合并目标：{proposal.targetId}</p>
        ) : null}
        <Field error={errors.name} label="能力名称" required>
          <input
            maxLength={200}
            onChange={(event) => setField('name', event.target.value)}
            value={stringValue(draft, 'name')}
          />
        </Field>
        <Field error={errors.jdFrequency} label="JD 频次" required>
          <input
            min={0}
            onChange={(event) => setField('jdFrequency', event.target.value)}
            step={1}
            type="number"
            value={String(draft.jdFrequency ?? '')}
          />
        </Field>
        <Field error={errors.evidence} label="已有证据">
          <textarea
            maxLength={40_000}
            onChange={(event) => setField('evidence', event.target.value)}
            rows={5}
            value={stringValue(draft, 'evidence')}
          />
        </Field>
        <Field error={errors.gaps} label="差距">
          <textarea
            maxLength={40_000}
            onChange={(event) => setField('gaps', event.target.value)}
            rows={5}
            value={stringValue(draft, 'gaps')}
          />
        </Field>
        <OptionalSelect
          label="归并到能力（可选）"
          onChange={(value) => setField('mergedIntoId', value)}
          options={options.capabilities
            .filter((item) => item.id !== proposal.targetId)
            .map((item) => ({ id: item.id, label: item.name }))}
          value={typeof draft.mergedIntoId === 'string' ? draft.mergedIntoId : null}
        />
      </>
    );
  }

  return (
    <>
      <Field error={errors.title} label="心得标题" required>
        <input
          maxLength={200}
          onChange={(event) => setField('title', event.target.value)}
          value={stringValue(draft, 'title')}
        />
      </Field>
      <Field error={errors.content} label="心得内容" required>
        <textarea
          maxLength={40_000}
          onChange={(event) => setField('content', event.target.value)}
          rows={7}
          value={stringValue(draft, 'content')}
        />
      </Field>
      <div className="proposal-editor__split">
        <OptionalSelect
          label="关联岗位（可选）"
          onChange={(value) => setField('positionId', value)}
          options={options.positions.map((item) => ({
            id: item.id,
            label: `${item.company} · ${item.title}`,
          }))}
          value={typeof draft.positionId === 'string' ? draft.positionId : null}
        />
        <OptionalSelect
          label="关联项目（可选）"
          onChange={(value) => setField('projectId', value)}
          options={options.projects.map((item) => ({ id: item.id, label: item.name }))}
          value={typeof draft.projectId === 'string' ? draft.projectId : null}
        />
        <OptionalSelect
          label="关联问题（可选）"
          onChange={(value) => setField('questionId', value)}
          options={options.questions.map((item) => ({ id: item.id, label: item.text }))}
          value={typeof draft.questionId === 'string' ? draft.questionId : null}
        />
        <OptionalSelect
          label="关联能力（可选）"
          onChange={(value) => setField('capabilityId', value)}
          options={options.capabilities.map((item) => ({ id: item.id, label: item.name }))}
          value={typeof draft.capabilityId === 'string' ? draft.capabilityId : null}
        />
      </div>
    </>
  );
}

export function ProposalCard({
  proposal,
  onResolved,
  assetOptions = emptyOptions,
}: ProposalCardProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(
    () => clonePayload(proposal.payload),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const context = {
    position: proposal.context.position
      ? `${proposal.context.position.company} · ${proposal.context.position.title}`
      : '未关联岗位',
    interview: proposal.context.interview
      ? `${proposal.context.interview.roundName}${proposal.context.interview.interviewDate
        ? ` · ${proposal.context.interview.interviewDate}`
        : ''}`
      : '未关联面试',
  };

  const mutate = async (
    action: () => Promise<ChangeProposal>,
    successMessage: string,
    inlineFailureMessage: string,
    failureToastMessage: string,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      onResolved(result);
      setEditing(false);
      toast.success(successMessage);
    } catch {
      setError(inlineFailureMessage);
      toast.error(failureToastMessage);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const beginEditing = () => {
    setDraft(clonePayload(proposal.payload));
    setFieldErrors({});
    setError('');
    setEditing(true);
  };

  const closeEditing = () => {
    if (busyRef.current) return;
    setDraft(clonePayload(proposal.payload));
    setFieldErrors({});
    setError('');
    setEditing(false);
  };

  const submitEdited = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    const occurrenceText = String(draft.occurrenceCount ?? '');
    const frequencyText = String(draft.jdFrequency ?? '');
    if (
      proposal.targetType === 'question'
      && (
        occurrenceText.trim() === ''
        || !Number.isInteger(Number(occurrenceText))
        || Number(occurrenceText) < 0
      )
    ) {
      setFieldErrors((current) => ({
        ...current,
        occurrenceCount: '请输入非负整数',
      }));
      return;
    }
    if (
      proposal.targetType === 'capability'
      && (
        frequencyText.trim() === ''
        || !Number.isInteger(Number(frequencyText))
        || Number(frequencyText) < 0
      )
    ) {
      setFieldErrors((current) => ({
        ...current,
        jdFrequency: '请输入非负整数',
      }));
      return;
    }
    const candidate = {
      ...draft,
      ...(proposal.targetType === 'question'
        ? { occurrenceCount: Number(draft.occurrenceCount) }
        : {}),
      ...(proposal.targetType === 'capability'
        ? { jdFrequency: Number(draft.jdFrequency) }
        : {}),
    };
    const schema = {
      project: strictProjectProposalPayloadSchema,
      question: strictQuestionProposalPayloadSchema,
      capability: strictCapabilityProposalPayloadSchema,
      insight: strictInsightProposalPayloadSchema,
    }[proposal.targetType];
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!(key in nextErrors)) nextErrors[key] = issue.message;
      }
      if (
        proposal.targetType === 'question'
        && (!Number.isInteger(Number(occurrenceText))
          || Number(occurrenceText) < 0)
      ) {
        nextErrors.occurrenceCount = '请输入非负整数';
      }
      if (
        proposal.targetType === 'capability'
        && (!Number.isInteger(Number(frequencyText))
          || Number(frequencyText) < 0)
      ) {
        nextErrors.jdFrequency = '请输入非负整数';
      }
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    void mutate(
      () => window.jobSearch.reviews.proposals.accept(proposal.id, parsed.data),
      '修改后的建议已接受并写入资产。',
      '写入失败，已保留你的修改。',
      '写入失败，请检查内容后重试。',
    );
  };

  const setField = (key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setError('');
  };

  const statusLabel = {
    pending: '待确认',
    accepted: '已接受',
    ignored: '已忽略',
  }[proposal.status];

  return (
    <article className="proposal-card">
      <header className="proposal-card__header">
        <div>
          <p className="section-label">{targetLabels[proposal.targetType]} / {operationLabels[proposal.operation]}</p>
          <h3>{proposal.rationale}</h3>
        </div>
        <StatusBadge
          label={statusLabel}
          tone={proposal.status === 'accepted' ? 'success' : proposal.status === 'ignored' ? 'neutral' : 'warning'}
        />
      </header>
      <dl className="proposal-context">
        <div><dt>岗位</dt><dd>{context.position}</dd></div>
        <div><dt>面试</dt><dd>{context.interview}</dd></div>
      </dl>
      <ProposalSummary
        payload={proposal.acceptedPayload ?? proposal.payload}
        proposal={proposal}
      />
      <p className="form-note">
        操作：{operationLabels[proposal.operation]}
        {proposal.targetId ? ` · 目标 ID：${proposal.targetId}` : ''}
      </p>
      {proposal.resolvedAt ? <p className="proposal-resolved">处理时间：{proposal.resolvedAt}</p> : null}
      {proposal.status === 'pending' ? (
        <div className="proposal-card__actions">
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void mutate(
              () => window.jobSearch.reviews.proposals.accept(proposal.id),
              '建议已接受并写入资产。',
              '写入失败，请稍后重试。',
              '接受失败，请稍后重试。',
            )}
            type="button"
          >
            接受
          </button>
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={beginEditing}
            type="button"
          >
            编辑后接受
          </button>
          <button
            className="button button--danger"
            disabled={busy}
            onClick={() => void mutate(
              () => window.jobSearch.reviews.proposals.ignore(proposal.id),
              '建议已忽略，资产没有变化。',
              '忽略失败，请稍后重试。',
              '忽略失败，请稍后重试。',
            )}
            type="button"
          >
            忽略
          </button>
        </div>
      ) : null}
      {!editing && error ? <p className="form-error" role="alert">{error}</p> : null}

      <Modal
        closeDisabled={busy}
        footer={(
          <>
            <button className="button button--quiet" disabled={busy} onClick={closeEditing} type="button">取消</button>
            <button
              className="button button--primary"
              disabled={busy}
              form={`proposal-editor-${proposal.id}`}
              type="submit"
            >
              {busy ? '写入中…' : '确认写入'}
            </button>
          </>
        )}
        onClose={closeEditing}
        open={editing}
        title={`编辑${targetLabels[proposal.targetType]}建议`}
      >
        <p className="form-note">
          {context.position} / {context.interview}
        </p>
        <form
          className="editor-form proposal-editor"
          id={`proposal-editor-${proposal.id}`}
          noValidate
          onSubmit={submitEdited}
        >
          <EditorFields
            draft={draft}
            errors={fieldErrors}
            options={assetOptions}
            proposal={proposal}
            setField={setField}
          />
          <details className="proposal-editor__advanced">
            <summary>高级 JSON 视图</summary>
            <pre className="user-text">{JSON.stringify(draft, null, 2)}</pre>
          </details>
          {fieldErrors.form ? <p className="form-error">{fieldErrors.form}</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </form>
      </Modal>
    </article>
  );
}
