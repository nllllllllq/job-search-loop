import { useMemo, useState } from 'react';
import type { Interview, InterviewReviewPreview } from '../../../shared/domain';
import type { InterviewEditInput } from '../../../shared/ipc';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { InterviewEditor } from './InterviewEditor';

interface InterviewPanelProps {
  positionId: string;
}

function sortTime(interview: Interview): number {
  const date = interview.interviewDate
    ? new Date(`${interview.interviewDate}T00:00:00.000Z`).valueOf()
    : new Date(interview.createdAt).valueOf();
  return Number.isNaN(date) ? 0 : date;
}

export function InterviewPanel({ positionId }: InterviewPanelProps) {
  const toast = useToast();
  const resource = useAsyncResource(
    () => window.jobSearch.reviews.interviews.list(positionId),
    [positionId],
  );
  const [editing, setEditing] = useState<Interview | null | undefined>(undefined);
  const [preview, setPreview] = useState<InterviewReviewPreview | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const interviews = useMemo(
    () => [...(resource.data ?? [])].sort(
      (left, right) => sortTime(right) - sortTime(left)
        || right.createdAt.localeCompare(left.createdAt),
    ),
    [resource.data],
  );

  const save = async (input: InterviewEditInput) => {
    const saved = editing
      ? await window.jobSearch.reviews.interviews.update(editing.id, input)
      : await window.jobSearch.reviews.interviews.create(input);
    resource.setData((current) => [
      saved,
      ...(current ?? []).filter((item) => item.id !== saved.id),
    ]);
    setEditing(undefined);
    toast.success('面试记录已保存。');
  };

  const openPreview = async (interviewId: string) => {
    if (previewingId) return;
    setPreviewingId(interviewId);
    try {
      setPreview(await window.jobSearch.reviews.review.preview(interviewId));
    } catch {
      toast.error('暂时无法准备 AI 复盘，请检查设置后重试。');
    } finally {
      setPreviewingId(null);
    }
  };

  const confirmReview = async () => {
    if (!preview || reviewingId) return;
    setReviewingId(preview.token);
    try {
      const result = await window.jobSearch.reviews.review.confirm(preview.token);
      resource.setData((current) => (current ?? []).map(
        (item) => item.id === result.interview.id ? result.interview : item,
      ));
      setPreview(null);
      toast.success(`复盘完成，生成 ${result.proposals.length} 条待确认变更。`);
    } catch {
      setPreview(null);
      toast.error('AI 复盘失败，面试文字未被修改。可重新预览后重试。');
    } finally {
      setReviewingId(null);
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      新增面试记录
    </button>
  );

  return (
    <div className="interview-panel">
      <header className="interview-panel__header">
        <div>
          <p className="section-label">INTERVIEW LOG / 面试记录</p>
          <h3>先保存事实，再决定是否交给 AI 复盘</h3>
          <p>当前版本仅支持手动输入文字；录音转写将在后续阶段提供。</p>
        </div>
        {interviews.length > 0 ? addButton : null}
      </header>
      {resource.loading ? <div className="resource-state" role="status">正在读取面试记录…</div> : null}
      {resource.error ? (
        <EmptyState
          action={<button className="button button--quiet" onClick={() => void resource.reload()} type="button">重试</button>}
          body="暂时无法读取本地面试记录。"
          icon="!"
          title="面试记录加载失败"
        />
      ) : null}
      {!resource.loading && !resource.error && interviews.length === 0 ? (
        <EmptyState
          action={addButton}
          body="记录轮次、日期与已经确认的文字内容，之后可主动发起 AI 复盘。"
          icon="面"
          title="还没有面试记录"
        />
      ) : null}
      <div className="interview-list">
        {interviews.map((item) => (
          <article className="interview-card" key={item.id}>
            <header>
              <div>
                <p>{item.interviewDate ?? '日期未记录'}</p>
                <h4>{item.roundName}</h4>
              </div>
              <div className="interview-card__actions">
                <button className="button button--quiet" onClick={() => setEditing(item)} type="button">
                  编辑
                </button>
                <button
                  className="button button--primary"
                  disabled={previewingId === item.id || item.reviewSnapshot !== null}
                  onClick={() => void openPreview(item.id)}
                  type="button"
                >
                  {item.reviewSnapshot
                    ? '已完成 AI 复盘'
                    : previewingId === item.id ? '准备预览…' : '开始 AI 复盘'}
                </button>
              </div>
            </header>
            <section>
              <h5>已确认文字记录</h5>
              <p className="user-text interview-transcript">{item.transcript}</p>
            </section>
            {item.personalNotes ? (
              <section><h5>个人感受 / 补充</h5><p className="user-text">{item.personalNotes}</p></section>
            ) : null}
            {item.summary ? (
              <section className="interview-summary">
                <h5>AI 复盘摘要</h5>
                <p className="user-text">{item.summary}</p>
              </section>
            ) : null}
            {item.feedbackResult ? (
              <section><h5>后续结果 / 反馈</h5><p className="user-text">{item.feedbackResult}</p></section>
            ) : null}
          </article>
        ))}
      </div>

      {editing !== undefined ? (
        <InterviewEditor
          initialValue={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSave={save}
          open
          positionId={positionId}
        />
      ) : null}

      <Modal
        closeDisabled={reviewingId !== null}
        footer={(
          <>
            <button className="button button--quiet" disabled={reviewingId !== null} onClick={() => setPreview(null)} type="button">
              取消
            </button>
            <button className="button button--primary" disabled={reviewingId !== null} onClick={() => void confirmReview()} type="button">
              {reviewingId ? '复盘中…' : '确认并开始复盘'}
            </button>
          </>
        )}
        onClose={() => setPreview(null)}
        open={preview !== null}
        title="确认发送复盘数据"
      >
        {preview ? (
          <div className="review-preview">
            <p className="review-preview__provider">{preview.provider} · {preview.model}</p>
            <p>{preview.positionLabel} / {preview.roundName}</p>
            <p>本次将发送以下数据类型：</p>
            <ul>{preview.dataTypes.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="form-note">AI 只会生成摘要和待确认变更，不会直接修改项目、问题、能力或心得。</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
