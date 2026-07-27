import { type KeyboardEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PositionInput } from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { PositionEditor } from './PositionEditor';
import { StageTimeline } from './StageTimeline';

type DetailTab = 'overview' | 'raw-jd' | 'process' | 'preparation' | 'interviews';

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: '概况' },
  { id: 'raw-jd', label: '原始 JD' },
  { id: 'process', label: '流程' },
  { id: 'preparation', label: '准备材料' },
  { id: 'interviews', label: '面试记录' },
];

function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) return false;
  return 'code' in value && typeof value.code === 'string';
}

async function loadPositionDetail(id: string) {
  try {
    return await window.jobSearch.positions.get(id);
  } catch (reason) {
    if (isAppError(reason)) {
      const safeError = new Error('岗位请求失败');
      Object.assign(safeError, { code: reason.code });
      throw safeError;
    }
    throw reason;
  }
}

export function PositionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resource = useAsyncResource(
    () => loadPositionDetail(id),
    [id],
  );

  const updatePosition = async (input: PositionInput) => {
    try {
      await window.jobSearch.positions.update(id, input);
      await resource.reload();
      setEditorOpen(false);
      toast.success('岗位记录已保存');
    } catch {
      toast.error('保存岗位失败，请稍后重试');
      throw new Error('position update failed');
    }
  };

  const removePosition = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await window.jobSearch.positions.remove(id);
      setDeleteOpen(false);
      toast.success('岗位记录已删除');
      navigate('/positions');
    } catch {
      toast.error('删除岗位失败，请稍后重试');
      setDeleting(false);
    }
  };

  if (resource.loading) {
    return <div className="resource-state" role="status"><span className="resource-state__mark" aria-hidden="true" />正在翻阅岗位档案…</div>;
  }

  if (resource.error) {
    const notFound = isAppError(resource.error) && resource.error.code === 'NOT_FOUND';
    return (
      <div className="position-detail-page">
        <Link className="back-link" to="/positions">← 返回岗位台账</Link>
        <EmptyState
          action={<Link className="button-link" to="/positions">返回岗位列表</Link>}
          body={notFound ? '这条记录可能已被删除，或地址已经失效。' : '暂时无法读取本机岗位详情，请稍后重试。'}
          icon={notFound ? '？' : '!'}
          title={notFound ? '没有找到这条岗位记录' : '岗位详情载入失败'}
        />
      </div>
    );
  }

  const position = resource.data;
  if (!position) return null;

  const activateTab = (index: number) => {
    const nextTab = tabs[index];
    if (!nextTab) return;
    setTab(nextTab.id);
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activateTab(nextIndex);
  };

  return (
    <div className="position-detail-page">
      <Link className="back-link" to="/positions">← 返回岗位台账</Link>
      <header className="position-detail-header">
        <div>
          <p className="section-label">岗位档案 / POSITION FILE</p>
          <h2>{position.company}</h2>
          <p className="position-detail-header__title">{position.title}</p>
          <div className="position-detail-header__meta">
            <span className="interest-score">{position.interest}<small>/5 兴趣度</small></span>
            <StatusBadge stage={position.currentStage ?? undefined} />
          </div>
        </div>
        <div className="position-detail-header__actions">
          <button className="button button--quiet" onClick={() => setEditorOpen(true)} type="button">编辑岗位</button>
          <button className="button button--danger" onClick={() => setDeleteOpen(true)} type="button">删除岗位</button>
        </div>
      </header>

      <div aria-label="岗位详情" className="detail-tabs" role="tablist">
        {tabs.map((item, index) => (
          <button
            aria-controls={`panel-${item.id}`}
            aria-selected={tab === item.id}
            className="detail-tab"
            id={`tab-${item.id}`}
            key={item.id}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            onClick={() => setTab(item.id)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={tab === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <section
        aria-labelledby={`tab-${tab}`}
        className="detail-panel"
        id={`panel-${tab}`}
        role="tabpanel"
      >
        {tab === 'overview' ? (
          <dl className="position-facts">
            <div><dt>公司</dt><dd>{position.company}</dd></div>
            <div><dt>岗位名称</dt><dd>{position.title}</dd></div>
            <div><dt>当前阶段</dt><dd><StatusBadge stage={position.currentStage ?? undefined} /></dd></div>
            <div><dt>最终结果</dt><dd>{position.finalResult ?? '—'}</dd></div>
          </dl>
        ) : null}
        {tab === 'raw-jd' ? (
          <article className="raw-jd" data-testid="raw-jd" style={{ whiteSpace: 'pre-wrap' }}>
            {position.rawJd}
          </article>
        ) : null}
        {tab === 'process' ? (
          <StageTimeline onRefresh={resource.reload} positionId={position.id} stages={position.stages} />
        ) : null}
        {tab === 'preparation' ? (
          <EmptyState body="岗位准备材料会在后续功能中出现在这里。" icon="备" title="还没有准备材料" />
        ) : null}
        {tab === 'interviews' ? (
          <EmptyState body="逐轮面试记录会在后续功能中出现在这里。" icon="面" title="还没有面试记录" />
        ) : null}
      </section>

      <PositionEditor
        initialValue={position}
        onClose={() => setEditorOpen(false)}
        onSave={updatePosition}
        open={editorOpen}
      />

      <Modal
        footer={
          <>
            <button className="button button--quiet" disabled={deleting} onClick={() => setDeleteOpen(false)} type="button">取消</button>
            <button className="button button--danger" disabled={deleting} onClick={() => void removePosition()} type="button">
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </>
        }
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        open={deleteOpen}
        title="确认删除岗位"
      >
        <p className="confirm-copy">
          将永久删除“{position.company} · {position.title}”及其流程记录。此操作无法撤销。
        </p>
      </Modal>
    </div>
  );
}
