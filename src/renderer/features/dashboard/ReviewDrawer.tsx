import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Capability,
  ChangeProposal,
  ChangeProposalListItem,
  CorruptChangeProposal,
  PositionListItem,
  Project,
  Question,
} from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import {
  ProposalCard,
  type ProposalAssetOptions,
} from '../../components/ProposalCard';
import { DashboardDrawer } from './DashboardDrawer';

interface ReviewDrawerProps {
  onClose: () => void;
  open: boolean;
  onChanged?: () => void;
}

type ReviewTab = 'pending' | 'history';

const emptyOptions: ProposalAssetOptions = {
  capabilities: [],
  positions: [],
  projects: [],
  questions: [],
};

function contextLines(item: CorruptChangeProposal) {
  return {
    position: item.context.position
      ? `${item.context.position.company} · ${item.context.position.title}`
      : '未关联岗位',
    interview: item.context.interview
      ? `${item.context.interview.roundName}${item.context.interview.interviewDate
        ? ` · ${item.context.interview.interviewDate}`
        : ''}`
      : '未关联面试',
  };
}

function CorruptProposalCard({ item }: { item: CorruptChangeProposal }) {
  const context = contextLines(item);
  return (
    <article className="proposal-card proposal-card--corrupt">
      <header className="proposal-card__header">
        <div>
          <p className="section-label">只读记录</p>
          <h3>建议数据不可用</h3>
        </div>
        <span className="corrupt-pill">不可操作</span>
      </header>
      <dl className="proposal-context">
        <div><dt>岗位</dt><dd>{context.position}</dd></div>
        <div><dt>面试</dt><dd>{context.interview}</dd></div>
      </dl>
      <p className="form-error" role="status">{item.message}</p>
    </article>
  );
}

export function ReviewDrawer({ onClose, open, onChanged }: ReviewDrawerProps) {
  const [tab, setTab] = useState<ReviewTab>('pending');
  const [items, setItems] = useState<ChangeProposalListItem[]>([]);
  const [corruptItems, setCorruptItems] = useState<CorruptChangeProposal[]>([]);
  const [options, setOptions] = useState<ProposalAssetOptions>(emptyOptions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestGeneration = useRef(0);

  const load = async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError('');
    try {
      const [proposalResult, positions, projects, questions, capabilities] =
        await Promise.all([
          window.jobSearch.reviews.proposals.list(),
          window.jobSearch.positions.list(),
          window.jobSearch.assets.projects.list(),
          window.jobSearch.assets.questions.list(),
          window.jobSearch.assets.capabilities.list(),
        ]);
      if (generation !== requestGeneration.current) return;
      setItems(proposalResult.items);
      setCorruptItems(proposalResult.corruptItems);
      setOptions({
        positions: positions as PositionListItem[],
        projects: projects as Project[],
        questions: questions as Question[],
        capabilities: capabilities as Capability[],
      });
    } catch {
      if (generation !== requestGeneration.current) return;
      setError('待确认清单读取失败，请稍后重试。');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      requestGeneration.current += 1;
      setLoading(false);
      return;
    }
    setTab('pending');
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [open]);

  const pending = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items],
  );
  const history = useMemo(
    () => items.filter((item) => item.status !== 'pending'),
    [items],
  );
  const corruptPending = useMemo(
    () => corruptItems.filter((item) => item.status === 'pending' || item.status === null),
    [corruptItems],
  );
  const corruptHistory = useMemo(
    () => corruptItems.filter((item) => item.status !== 'pending' && item.status !== null),
    [corruptItems],
  );
  const visible = tab === 'pending' ? pending : history;
  const visibleCorrupt = tab === 'pending' ? corruptPending : corruptHistory;

  const resolved = (current: ChangeProposalListItem, result: ChangeProposal) => {
    setItems((all) => all.map((item) => item.id === result.id
      ? { ...result, context: current.context }
      : item));
    onChanged?.();
  };

  return (
    <DashboardDrawer
      eyebrow="REVIEW BEFORE WRITE / 先确认再写入"
      onClose={onClose}
      open={open}
      title="待确认清单"
    >
      <div aria-label="建议视图" className="segmented-control" role="group">
        <button
          aria-pressed={tab === 'pending'}
          onClick={() => setTab('pending')}
          type="button"
        >
          待处理 {pending.length + corruptPending.length}
        </button>
        <button
          aria-pressed={tab === 'history'}
          onClick={() => setTab('history')}
          type="button"
        >
          历史 {history.length + corruptHistory.length}
        </button>
      </div>
      {loading ? <div className="resource-state" role="status">正在读取建议…</div> : null}
      {error ? (
        <EmptyState
          action={<button className="button button--quiet" onClick={() => void load()} type="button">重试</button>}
          body="本地建议没有被修改。"
          icon="!"
          title={error}
        />
      ) : null}
      {!loading && !error && visible.length === 0 && visibleCorrupt.length === 0 ? (
        <p className="dashboard-drawer__empty">
          {tab === 'pending' ? '当前没有待处理建议。' : '当前没有处理历史。'}
        </p>
      ) : null}
      {!loading && !error ? (
        <div className="proposal-grid">
          {visible.map((proposal) => (
            <ProposalCard
              assetOptions={options}
              key={proposal.id}
              onResolved={(result) => resolved(proposal, result)}
              proposal={proposal}
            />
          ))}
          {visibleCorrupt.map((proposal) => (
            <CorruptProposalCard item={proposal} key={proposal.id} />
          ))}
        </div>
      ) : null}
    </DashboardDrawer>
  );
}
