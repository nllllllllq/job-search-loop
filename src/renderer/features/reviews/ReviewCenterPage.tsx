import { useMemo, useState } from 'react';
import type { ChangeProposal } from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import { ProposalCard } from '../../components/ProposalCard';
import { useAsyncResource } from '../../hooks/useAsyncResource';

type View = 'all' | 'pending' | 'history';

export function ReviewCenterPage() {
  const [view, setView] = useState<View>('all');
  const resource = useAsyncResource(
    () => window.jobSearch.reviews.proposals.list(),
    [],
  );
  const proposals = resource.data?.items ?? [];
  const pending = useMemo(
    () => proposals.filter((item) => item.status === 'pending'),
    [proposals],
  );
  const history = useMemo(
    () => proposals.filter((item) => item.status !== 'pending'),
    [proposals],
  );
  const resolved = (proposal: ChangeProposal) => {
    resource.setData((current) => current === null ? current : ({
      ...current,
      items: current.items.map(
        (item) => item.id === proposal.id ? proposal : item,
      ),
    }));
  };

  return (
    <div className="review-center">
      <header className="review-center__header">
        <div>
          <p className="section-label">REVIEW BEFORE WRITE / 复盘沉淀</p>
          <h2>待确认变更</h2>
          <p>AI 建议先停在这里。只有你明确接受的内容，才会进入长期资产。</p>
        </div>
        <div aria-label="建议筛选" className="segmented-control" role="group">
          {([
            ['all', '全部'],
            ['pending', `待确认 ${pending.length}`],
            ['history', `处理历史 ${history.length}`],
          ] as const).map(([id, label]) => (
            <button
              aria-pressed={view === id}
              key={id}
              onClick={() => setView(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {resource.loading ? <div className="resource-state" role="status">正在读取变更建议…</div> : null}
      {resource.error ? (
        <EmptyState
          action={<button className="button button--quiet" onClick={() => void resource.reload()} type="button">重试</button>}
          body="本地变更建议暂时无法读取。"
          icon="!"
          title="复盘中心加载失败"
        />
      ) : null}
      {!resource.loading && !resource.error && proposals.length === 0 ? (
        <EmptyState
          body="完成一次面试复盘后，AI 提出的项目、问题、能力与心得建议会先来到这里。"
          icon="复"
          title="还没有待确认变更"
        />
      ) : null}
      {(view === 'all' || view === 'pending') && pending.length > 0 ? (
        <section className="review-section" aria-labelledby="pending-heading">
          <h3 id="pending-heading">待确认</h3>
          <div className="proposal-grid">
            {pending.map((proposal) => (
              <ProposalCard key={proposal.id} onResolved={resolved} proposal={proposal} />
            ))}
          </div>
        </section>
      ) : null}
      {(view === 'all' || view === 'history') && history.length > 0 ? (
        <section className="review-section" aria-labelledby="history-heading">
          <h3 id="history-heading">处理历史</h3>
          <div className="proposal-grid">
            {history.map((proposal) => (
              <ProposalCard key={proposal.id} onResolved={resolved} proposal={proposal} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
