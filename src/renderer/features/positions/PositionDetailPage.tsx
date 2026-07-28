import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PositionInput } from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { InterviewPanel } from '../interviews/InterviewPanel';
import { PreparationPanel } from '../preparations/PreparationPanel';
import { PositionEditor } from './PositionEditor';
import { StageTimeline } from './StageTimeline';

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
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const resource = useAsyncResource(() => loadPositionDetail(id), [id]);

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
    return (
      <div className="resource-state" role="status">
        <span className="resource-state__mark" aria-hidden="true" />
        正在翻阅岗位档案…
      </div>
    );
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

  return (
    <div className="position-detail-page">
      <Link className="back-link" to="/positions">← 返回岗位台账</Link>
      <header className="position-detail-header">
        <div className="position-detail-header__identity">
          <div>
            <h2>{position.company}</h2>
            <p className="position-detail-header__title">{position.title}</p>
          </div>
          <div className="position-detail-header__meta">
            <span className="position-location">
              {position.location || '位置未记录'}
            </span>
            <span className="interest-score">
              {position.interest}<small>/5 兴趣度</small>
            </span>
            <StatusBadge stage={position.currentStage ?? undefined} />
          </div>
        </div>
        <div className="position-detail-header__actions">
          <button
            className="button button--quiet"
            onClick={() => setEditorOpen(true)}
            type="button"
          >
            编辑岗位
          </button>
          <button
            aria-label="删除岗位"
            className="button button--danger"
            onClick={() => setDeleteOpen(true)}
            type="button"
          >
            删除
          </button>
        </div>
      </header>

      <section className="position-workspace-section" aria-label="岗位流程">
        <StageTimeline
          onRefresh={resource.reload}
          positionId={position.id}
          stages={position.stages}
        />
      </section>

      <section className="position-workspace-section position-workspace-section--jd" aria-labelledby="jd-title">
        <header className="position-workspace-section__header">
          <h3 id="jd-title">JD</h3>
          <span>原始内容</span>
        </header>
        <article className="raw-jd" data-testid="raw-jd" style={{ whiteSpace: 'pre-wrap' }}>
          {position.rawJd}
        </article>
      </section>

      <section className="position-workspace-section" aria-labelledby="preparation-title">
        <header className="position-workspace-section__header">
          <h3 id="preparation-title">准备材料</h3>
          <span>最新版本优先</span>
        </header>
        <PreparationPanel positionId={position.id} />
      </section>

      <section className="position-workspace-section" aria-labelledby="interviews-title">
        <header className="position-workspace-section__header">
          <h3 id="interviews-title">面试记录</h3>
          <span>记录与复盘</span>
        </header>
        <InterviewPanel positionId={position.id} />
      </section>

      <PositionEditor
        initialValue={position}
        onClose={() => setEditorOpen(false)}
        onSave={updatePosition}
        open={editorOpen}
      />

      <Modal
        footer={(
          <>
            <button
              className="button button--quiet"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="button button--danger"
              disabled={deleting}
              onClick={() => void removePosition()}
              type="button"
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </>
        )}
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
