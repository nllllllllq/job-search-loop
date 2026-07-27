import { useEffect, useMemo, useState } from 'react';
import type { ChangeProposal } from '../../shared/domain';
import {
  capabilityPayloadSchema,
  insightPayloadSchema,
  projectPayloadSchema,
  questionPayloadSchema,
} from '../../shared/schemas';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';

interface ProposalCardProps {
  proposal: ChangeProposal;
  onResolved: (proposal: ChangeProposal) => void;
}

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

function parsePayload(proposal: ChangeProposal, text: string): unknown | null {
  try {
    const value: unknown = JSON.parse(text);
    const schema = {
      project: projectPayloadSchema,
      question: questionPayloadSchema,
      capability: capabilityPayloadSchema,
      insight: insightPayloadSchema,
    }[proposal.targetType];
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ProposalCard({ proposal, onResolved }: ProposalCardProps) {
  const [editing, setEditing] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(proposal.payload, null, 2));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<{ position: string; interview: string }>({
    position: '未关联岗位',
    interview: '未关联面试',
  });
  const editedPayload = useMemo(
    () => parsePayload(proposal, jsonText),
    [jsonText, proposal],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      proposal.positionId
        ? window.jobSearch.positions.get(proposal.positionId)
        : Promise.resolve(null),
      proposal.interviewId
        ? window.jobSearch.reviews.interviews.get(proposal.interviewId)
        : Promise.resolve(null),
    ]).then(([position, interview]) => {
      if (!active) return;
      setContext({
        position: position ? `${position.company} · ${position.title}` : '未关联岗位',
        interview: interview ? interview.roundName : '未关联面试',
      });
    }).catch(() => {
      if (active) setContext({ position: '关联岗位暂不可用', interview: '关联面试暂不可用' });
    });
    return () => {
      active = false;
    };
  }, [proposal.interviewId, proposal.positionId]);

  const mutate = async (
    action: () => Promise<ChangeProposal>,
    failureMessage: string,
  ) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      onResolved(result);
      setEditing(false);
    } catch {
      setError(failureMessage);
    } finally {
      setBusy(false);
    }
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
      <div className="proposal-payload">
        <h4>建议内容</h4>
        <pre className="user-text">{JSON.stringify(proposal.payload, null, 2)}</pre>
      </div>
      {proposal.acceptedPayload ? (
        <div className="proposal-payload">
          <h4>最终写入内容</h4>
          <pre className="user-text">{JSON.stringify(proposal.acceptedPayload, null, 2)}</pre>
        </div>
      ) : null}
      {proposal.resolvedAt ? <p className="proposal-resolved">处理时间：{proposal.resolvedAt}</p> : null}
      {proposal.status === 'pending' ? (
        <div className="proposal-card__actions">
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void mutate(
              () => window.jobSearch.reviews.proposals.accept(proposal.id),
              '写入失败，请稍后重试。',
            )}
            type="button"
          >
            接受
          </button>
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={() => {
              setJsonText(JSON.stringify(proposal.payload, null, 2));
              setError('');
              setEditing(true);
            }}
            type="button"
          >
            编辑后接受
          </button>
          <button
            className="button button--danger"
            disabled={busy}
            onClick={() => void mutate(
              () => window.jobSearch.reviews.proposals.ignore(proposal.id),
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
            <button className="button button--quiet" disabled={busy} onClick={() => setEditing(false)} type="button">取消</button>
            <button
              className="button button--primary"
              disabled={busy || editedPayload === null}
              onClick={() => {
                if (editedPayload !== null) {
                  void mutate(
                    () => window.jobSearch.reviews.proposals.accept(proposal.id, editedPayload),
                    '写入失败，已保留你的修改。',
                  );
                }
              }}
              type="button"
            >
              {busy ? '写入中…' : '确认写入'}
            </button>
          </>
        )}
        onClose={() => setEditing(false)}
        open={editing}
        title={`编辑${targetLabels[proposal.targetType]}建议`}
      >
        <label className="field">
          <span className="field__label">建议内容 JSON</span>
          <textarea
            aria-invalid={editedPayload === null}
            onChange={(event) => {
              setJsonText(event.target.value);
              setError('');
            }}
            rows={16}
            value={jsonText}
          />
        </label>
        {editedPayload === null ? <p className="field__error">内容不符合该资产类型的字段与长度要求。</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </Modal>
    </article>
  );
}
