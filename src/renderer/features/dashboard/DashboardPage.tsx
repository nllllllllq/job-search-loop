import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  CapabilityAnalysisPreview,
  DashboardSummary,
  PositionListItem,
} from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { CapabilityFrequency } from './CapabilityFrequency';
import { CapabilityDrawer } from './CapabilityDrawer';
import { ProcessTimeline } from './ProcessTimeline';
import { ReviewDrawer } from './ReviewDrawer';
import { StageDistribution } from './StageDistribution';

function readableError(error: unknown): string {
  if (
    error !== null
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) return error.message;
  return '操作未完成，请稍后重试。';
}

interface AnalysisModalProps {
  open: boolean;
  positions: PositionListItem[];
  onClose: () => void;
  onCreated: () => void;
}

function AnalysisModal({
  open,
  positions,
  onClose,
  onCreated,
}: AnalysisModalProps) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<CapabilityAnalysisPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetAndClose = () => {
    if (submitting) return;
    setSelected([]);
    setPreview(null);
    setError('');
    onClose();
  };

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
    setPreview(null);
    setError('');
  };

  const requestPreview = async () => {
    setSubmitting(true);
    setError('');
    try {
      setPreview(await window.jobSearch.system.previewCapabilityAnalysis(selected));
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setSubmitting(true);
    setError('');
    try {
      const proposals = await window.jobSearch.system.confirmCapabilityAnalysis(preview.token);
      toast.success(`已生成 ${proposals.length} 条待确认能力建议。`);
      onCreated();
      setSubmitting(false);
      resetAndClose();
    } catch (reason) {
      setError(readableError(reason));
      setSubmitting(false);
      setPreview(null);
    }
  };

  return (
    <Modal
      closeDisabled={submitting}
      footer={(
        <>
          <button
            className="button button--quiet"
            disabled={submitting}
            onClick={resetAndClose}
            type="button"
          >
            取消分析
          </button>
          {preview ? (
            <button
              className="button button--primary"
              disabled={submitting}
              onClick={() => void confirm()}
              type="button"
            >
              {submitting ? '正在分析…' : '确认发送并分析'}
            </button>
          ) : (
            <button
              className="button button--primary"
              disabled={submitting || selected.length < 2}
              onClick={() => void requestPreview()}
              type="button"
            >
              {submitting ? '正在准备预览…' : '查看发送内容'}
            </button>
          )}
        </>
      )}
      onClose={resetAndClose}
      open={open}
      title="分析共性能力"
    >
      <div className="capability-analysis">
        <p className="capability-analysis__notice">
          默认不选择岗位。请至少选择 2 个 JD；系统不会自动分析。
          重复分析会产生一组新的待确认建议。
        </p>
        {positions.length === 0 ? (
          <p>请先记录至少两个岗位，再开始共性能力分析。</p>
        ) : (
          <fieldset className="capability-analysis__picker" disabled={submitting || preview !== null}>
            <legend>选择要发送给外部 AI 的岗位（已选 {selected.length}）</legend>
            {positions.map((position) => (
              <label key={position.id}>
                <input
                  checked={selected.includes(position.id)}
                  onChange={() => toggle(position.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{position.company} · {position.title}</strong>
                  <small>兴趣度 {position.interest}/5</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {preview ? (
          <section className="capability-analysis__preview" aria-label="外发内容确认">
            <h3>发送内容确认</h3>
            <dl>
              <div><dt>服务来源</dt><dd>{preview.provider}</dd></div>
              <div><dt>模型</dt><dd>{preview.model}</dd></div>
              <div><dt>岗位数量</dt><dd>{preview.positions.length}</dd></div>
            </dl>
            <p>
              仅发送下列已选岗位的原始 JD、当前“共性能力分析” Prompt，
              以及生成结构约束。不会发送其他岗位或长期资产。
            </p>
            <details>
              <summary>当前共性能力分析 Prompt</summary>
              <pre>{preview.prompt}</pre>
            </details>
            {preview.positions.map((position) => (
              <details key={position.id}>
                <summary>{position.label} · 原始 JD</summary>
                <pre>{position.rawJd}</pre>
              </details>
            ))}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    ['公司数量', summary.companyCount],
    ['累计岗位', summary.totalPositions],
    ['进入面试', summary.positionsWithInterviews],
    ['完成复盘', summary.completedReviews],
    ['待确认建议', summary.pendingProposals],
  ] as const;
  return (
    <section className="dashboard-stats" aria-label="求职进度摘要">
      {cards.map(([label, value], index) => (
        <article className="dashboard-stat" key={label}>
          <span className="dashboard-stat__index">0{index + 1}</span>
          <strong className="dashboard-stat__value">{value}</strong>
          <span>{label}</span>
        </article>
      ))}
    </section>
  );
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [positionOptions, setPositionOptions] = useState<PositionListItem[]>([]);
  const toast = useToast();
  const summary = useAsyncResource(
    () => window.jobSearch.system.getDashboardSummary(),
    [],
  );
  const data = summary.data ?? {
    totalPositions: 0,
    companyCount: 0,
    stageDistribution: [],
    positionsWithInterviews: 0,
    completedReviews: 0,
    pendingProposals: 0,
    processEvents: [],
    capabilityFrequency: [],
    recentPositions: [],
  };
  const recent = useMemo(() => data?.recentPositions ?? [], [data]);
  const drawer = searchParams.get('drawer');
  const openDrawer = useCallback((value: 'reviews' | 'capabilities') => {
    const next = new URLSearchParams(searchParams);
    next.set('drawer', value);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const closeDrawer = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('drawer');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="dashboard-page">
      {summary.loading ? (
        <div className="resource-state" role="status">正在整理求职进度…</div>
      ) : summary.error || !summary.data ? (
        <EmptyState
          action={(
            <button className="button button--quiet" onClick={() => void summary.reload()} type="button">
              重试
            </button>
          )}
          body="本地进度统计暂时无法读取，岗位与复盘记录没有被修改。"
          icon="!"
          title="总览加载失败"
        />
      ) : (
        <>
      <header className="page-heading dashboard-heading">
        <div>
          <p className="section-label">LOOP OVERVIEW / 求职进度</p>
          <h2>把分散的经历，收拢成可复用的判断。</h2>
          <p>查看岗位阶段、流程日期与已经沉淀的能力证据。</p>
        </div>
        <button
          className="button button--primary"
          onClick={() => {
            setAnalysisOpen(true);
            setPositionOptions([]);
            void window.jobSearch.positions.list()
              .then(setPositionOptions)
              .catch(() => toast.error('岗位列表读取失败，请关闭后重试。'));
          }}
          type="button"
        >
          分析共性能力
        </button>
      </header>

      <SummaryCards summary={data} />

      <section aria-label="总览快捷入口" className="dashboard-shortcuts">
        <button
          className="dashboard-shortcut"
          onClick={() => openDrawer('reviews')}
          type="button"
        >
          <span>待确认清单</span>
          <strong>{data.pendingProposals}</strong>
          <small>确认后才写入长期资产</small>
        </button>
        <button
          className="dashboard-shortcut"
          onClick={() => openDrawer('capabilities')}
          type="button"
        >
          <span>能力主题</span>
          <strong>{data.capabilityFrequency.length}</strong>
          <small>查看高频能力与证据</small>
        </button>
      </section>

      {data.totalPositions === 0 ? (
        <EmptyState
          action={<Link className="button-link" to="/positions">记录第一个岗位</Link>}
          body="岗位记录会驱动阶段分布、流程日期、复盘数量与能力频次。"
          icon="始"
          title="从一份真实 JD 开始"
        />
      ) : (
        <>
          <section className="dashboard-grid">
            <article className="dashboard-panel">
              <header>
                <div>
                  <p className="section-label">STAGE MAP</p>
                  <h3>当前阶段分布</h3>
                </div>
              </header>
              <StageDistribution items={data.stageDistribution} total={data.totalPositions} />
            </article>
            <article className="dashboard-panel">
              <header>
                <div>
                  <p className="section-label">CAPABILITY SIGNALS</p>
                  <h3>能力频次</h3>
                </div>
                <button className="text-button" onClick={() => openDrawer('capabilities')} type="button">
                  查看能力库
                </button>
              </header>
              <CapabilityFrequency items={data.capabilityFrequency} />
            </article>
          </section>

          <section className="dashboard-panel dashboard-panel--wide">
            <header>
              <div>
                <p className="section-label">PROCESS DATES</p>
                <h3>流程日期线</h3>
              </div>
              <p>日期仅用于记录流程，不会创建提醒</p>
            </header>
            <ProcessTimeline events={data.processEvents} />
          </section>

          <section className="dashboard-panel dashboard-panel--wide">
            <header>
              <div>
                <p className="section-label">RECENT FILES</p>
                <h3>近期岗位</h3>
              </div>
              <Link to="/positions">全部岗位</Link>
            </header>
            <ul className="recent-position-list">
              {recent.map((position) => (
                <li key={position.id}>
                  <Link to={`/positions/${position.id}`}>
                    <span>
                      <strong>{position.company}</strong>
                      <small>{position.title}</small>
                    </span>
                    <StatusBadge stage={position.currentStage ?? undefined} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
        </>
      )}

      <AnalysisModal
        onClose={() => setAnalysisOpen(false)}
        onCreated={() => {
          void summary.reload();
        }}
        open={analysisOpen}
        positions={positionOptions}
      />
      <ReviewDrawer
        onChanged={() => void summary.reload()}
        onClose={closeDrawer}
        open={drawer === 'reviews'}
      />
      <CapabilityDrawer
        onChanged={() => void summary.reload()}
        onClose={closeDrawer}
        open={drawer === 'capabilities'}
      />
    </div>
  );
}
