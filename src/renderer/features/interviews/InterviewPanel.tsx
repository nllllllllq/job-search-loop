import { useMemo, useState } from 'react';
import type {
  Capability,
  Insight,
  Interview,
  InterviewReviewPreview,
  InterviewReviewSelectedAssetIds,
  Project,
  Question,
} from '../../../shared/domain';
import type { InterviewEditInput } from '../../../shared/ipc';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { InterviewEditor } from './InterviewEditor';

interface InterviewPanelProps {
  positionId: string;
}

const EMPTY_SELECTION: InterviewReviewSelectedAssetIds = {
  projectIds: [],
  questionIds: [],
  capabilityIds: [],
  insightIds: [],
};

interface AssetOptions {
  projects: Project[];
  questions: Question[];
  capabilities: Capability[];
  insights: Insight[];
}

const EMPTY_OPTIONS: AssetOptions = {
  projects: [],
  questions: [],
  capabilities: [],
  insights: [],
};

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
  const [selectionInterviewId, setSelectionInterviewId] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<InterviewReviewSelectedAssetIds>(
    EMPTY_SELECTION,
  );
  const [assetOptions, setAssetOptions] = useState<AssetOptions>(EMPTY_OPTIONS);
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

  const beginReview = async (interviewId: string) => {
    if (previewingId) return;
    setPreviewingId(interviewId);
    try {
      const [projects, questions, capabilities, insights] = await Promise.all([
        window.jobSearch.assets.projects.list(),
        window.jobSearch.assets.questions.list(),
        window.jobSearch.assets.capabilities.list(),
        window.jobSearch.assets.insights.list(),
      ]);
      setAssetOptions({ projects, questions, capabilities, insights });
      setSelectedAssets(EMPTY_SELECTION);
      setSelectionInterviewId(interviewId);
    } catch {
      toast.error('暂时无法读取本地资产，请稍后重试。');
    } finally {
      setPreviewingId(null);
    }
  };

  const openPreview = async () => {
    if (!selectionInterviewId || previewingId) return;
    setPreviewingId(selectionInterviewId);
    try {
      const next = await window.jobSearch.reviews.review.preview({
        interviewId: selectionInterviewId,
        selectedAssets,
      });
      setSelectionInterviewId(null);
      setPreview(next);
    } catch {
      toast.error('暂时无法准备 AI 复盘，请检查设置后重试。');
    } finally {
      setPreviewingId(null);
    }
  };

  const closeReviewModal = async () => {
    const token = preview?.token;
    setPreview(null);
    setSelectionInterviewId(null);
    setSelectedAssets(EMPTY_SELECTION);
    if (token) {
      try {
        await window.jobSearch.reviews.review.cancelPreview(token);
      } catch {
        toast.error('复盘预览已在本地失效，请重新开始。');
      }
    }
  };

  const toggleAsset = (
    key: keyof InterviewReviewSelectedAssetIds,
    id: string,
  ) => {
    setSelectedAssets((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((item) => item !== id)
        : [...current[key], id],
    }));
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
                  onClick={() => void beginReview(item.id)}
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
            <button className="button button--quiet" disabled={reviewingId !== null} onClick={() => void closeReviewModal()} type="button">
              取消
            </button>
            {preview ? (
              <button className="button button--primary" disabled={reviewingId !== null} onClick={() => void confirmReview()} type="button">
                {reviewingId ? '复盘中…' : '确认并开始复盘'}
              </button>
            ) : (
              <button className="button button--primary" disabled={previewingId !== null} onClick={() => void openPreview()} type="button">
                {previewingId ? '准备预览…' : '预览发送内容'}
              </button>
            )}
          </>
        )}
        onClose={() => void closeReviewModal()}
        open={preview !== null || selectionInterviewId !== null}
        title={preview ? '确认发送复盘数据' : '选择复盘参考资产'}
      >
        {selectionInterviewId ? (
          <div className="review-preview">
            <p>默认不选择任何资产；未选择时，AI 只能提出新建建议。</p>
            {([
              ['项目', 'projectIds', assetOptions.projects, (item: Project) => item.name],
              ['面试问题', 'questionIds', assetOptions.questions, (item: Question) => item.text],
              ['能力', 'capabilityIds', assetOptions.capabilities, (item: Capability) => item.name],
              ['心得', 'insightIds', assetOptions.insights, (item: Insight) => item.title],
            ] as const).map(([label, key, items, nameOf]) => (
              <fieldset className="review-preview__assets" key={key}>
                <legend>{label}</legend>
                {items.length === 0 ? <p className="form-note">暂无可选内容</p> : items.map((item) => (
                  <label key={item.id}>
                    <input
                      checked={selectedAssets[key].includes(item.id)}
                      onChange={() => toggleAsset(key, item.id)}
                      type="checkbox"
                    />
                    <span>{nameOf(item as never)}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        ) : preview ? (
          <div className="review-preview">
            <p className="review-preview__provider">{preview.provider} · {preview.model}</p>
            <p>{preview.positionLabel} / {preview.roundName}</p>
            <details>
              <summary>岗位与原始 JD</summary>
              <p>{preview.outbound.position.company} · {preview.outbound.position.title}</p>
              <pre className="user-text">{preview.outbound.position.rawJd}</pre>
              <pre aria-label="完整岗位数据" className="user-text">
                {JSON.stringify(preview.outbound.position, null, 2)}
              </pre>
            </details>
            <details>
              <summary>完整面试记录</summary>
              <pre className="user-text">{preview.outbound.interview.transcript}</pre>
              <pre className="user-text">{preview.outbound.interview.personalNotes}</pre>
              <pre aria-label="完整面试数据" className="user-text">
                {JSON.stringify(preview.outbound.interview, null, 2)}
              </pre>
            </details>
            <details>
              <summary>当前复盘 Prompt</summary>
              <pre className="user-text">{preview.outbound.prompt}</pre>
            </details>
            <details>
              <summary>已选择的完整资产</summary>
              {preview.outbound.selectedAssets.projects.map((item) => (
                <section key={item.id}>
                  <strong>{item.name}</strong>
                  <pre className="user-text">{JSON.stringify(item, null, 2)}</pre>
                </section>
              ))}
              {preview.outbound.selectedAssets.questions.map((item) => (
                <section key={item.id}>
                  <strong>{item.text}</strong>
                  <pre className="user-text">{JSON.stringify(item, null, 2)}</pre>
                </section>
              ))}
              {preview.outbound.selectedAssets.capabilities.map((item) => (
                <section key={item.id}>
                  <strong>{item.name}</strong>
                  <pre className="user-text">{JSON.stringify(item, null, 2)}</pre>
                </section>
              ))}
              {preview.outbound.selectedAssets.insights.map((item) => (
                <section key={item.id}>
                  <strong>{item.title}</strong>
                  <pre className="user-text">{JSON.stringify(item, null, 2)}</pre>
                </section>
              ))}
              {Object.values(preview.outbound.selectedAssets).every((items) => items.length === 0)
                ? <p>未选择资产；AI 只能提出新建建议。</p>
                : null}
            </details>
            <p className="form-note">AI 只会生成摘要和待确认变更，不会直接修改项目、问题、能力或心得。</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
