import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Capability,
  Insight,
  Interview,
  InterviewReviewReusableItem,
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
import { ReviewToCapabilityEditor } from '../dashboard/ReviewToCapabilityEditor';
import { ReviewToInsightEditor } from '../insights/ReviewToInsightEditor';
import { ReviewToProjectEditor } from '../projects/ReviewToProjectEditor';
import { ReviewToQuestionEditor } from '../questions/ReviewToQuestionEditor';
import { InterviewEditor } from './InterviewEditor';

interface InterviewPanelProps {
  positionId: string;
  stageId?: string | null;
  stageName?: string;
  interviews?: Interview[];
  compact?: boolean;
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

function reusableTargetLabel(targetType: InterviewReviewReusableItem['targetType']): string {
  switch (targetType) {
    case 'project': return '项目';
    case 'question': return '问题';
    case 'capability': return '能力';
    case 'insight': return '心得';
  }
}

function isReusableItem<T extends InterviewReviewReusableItem['targetType']>(
  item: InterviewReviewReusableItem | null,
  targetType: T,
): item is InterviewReviewReusableItem & { targetType: T } {
  return item?.targetType === targetType;
}

function ReviewSnapshot({
  interview,
  onSelectReusableItem,
}: {
  interview: Interview;
  onSelectReusableItem: (item: InterviewReviewReusableItem) => void;
}) {
  if (interview.reviewSnapshot.status !== 'valid') return null;
  const { output } = interview.reviewSnapshot.snapshot;
  if ('overview' in output) {
    return (
      <div className="interview-review-modules">
        <section>
          <h5>本轮概览</h5>
          <p><strong>{output.overview.round}</strong></p>
          <p className="user-text">{output.overview.overall}</p>
          {output.overview.keyFacts.length > 0 ? (
            <ul>
              {output.overview.keyFacts.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
        <section>
          <h5>问题与回答</h5>
          {output.questionAnswers.length === 0 ? <p>暂无结构化问题记录。</p> : output.questionAnswers.map((item, index) => (
            <article key={`${item.question}-${index}`}>
              <p><strong>{item.question}</strong></p>
              <p className="user-text">{item.answerSummary}</p>
              <p>回答质量：{item.quality}</p>
              <p>改进方向：{item.improvement}</p>
            </article>
          ))}
        </section>
        <section>
          <h5>优势与风险</h5>
          <p><strong>优势</strong></p>
          <ul>{output.strengthsAndRisks.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>风险</strong></p>
          <ul>{output.strengthsAndRisks.risks.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h5>下一轮准备</h5>
          {output.nextRoundPreparation.length === 0 ? <p>暂无准备事项。</p> : (
            <ul>{output.nextRoundPreparation.map((item) => <li key={item}>{item}</li>)}</ul>
          )}
        </section>
        <section>
          <h5>可复用内容</h5>
          {output.reusableItems.length === 0 ? <p>暂无可复用内容。</p> : output.reusableItems.map((item, index) => (
            <article key={`${item.targetType}-${item.title}-${index}`}>
              <p><strong>{item.title}</strong></p>
              <p className="user-text">{item.content}</p>
              <button
                className="button button--quiet"
                onClick={() => onSelectReusableItem(item)}
                type="button"
              >
                纳入{reusableTargetLabel(item.targetType)}
              </button>
            </article>
          ))}
        </section>
      </div>
    );
  }
  return (
    <section className="interview-summary">
      <h5>历史 AI 复盘摘要</h5>
      <p className="user-text">{output.summary}</p>
    </section>
  );
}

export function InterviewPanel({
  positionId,
  stageId,
  stageName,
  interviews: interviewsProp,
  compact = false,
}: InterviewPanelProps) {
  const toast = useToast();
  const resource = useAsyncResource(
    () => interviewsProp === undefined
      ? window.jobSearch.reviews.interviews.list(positionId)
      : Promise.resolve(interviewsProp),
    [positionId, interviewsProp],
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
  const [reviewErrorId, setReviewErrorId] = useState<string | null>(null);
  const [selectedReusableItem, setSelectedReusableItem] = useState<InterviewReviewReusableItem | null>(null);
  const previewRequestGeneration = useRef(0);
  const mounted = useRef(true);
  const sourceInterviews = resource.data ?? interviewsProp;
  const interviews = useMemo(
    () => [...(sourceInterviews ?? [])]
      .filter((item) => stageId === undefined || (item.stageId ?? null) === stageId)
      .sort(
      (left, right) => sortTime(right) - sortTime(left)
        || right.createdAt.localeCompare(left.createdAt),
      ),
    [sourceInterviews, stageId],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewRequestGeneration.current += 1;
    };
  }, []);

  const save = async (input: InterviewEditInput) => {
    const inputWithStage = {
      ...input,
      stageId: stageId === undefined ? (input.stageId ?? null) : stageId,
    };
    const saved = editing
      ? await window.jobSearch.reviews.interviews.update(editing.id, inputWithStage)
      : await window.jobSearch.reviews.interviews.create(inputWithStage);
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
    const requestGeneration = previewRequestGeneration.current + 1;
    previewRequestGeneration.current = requestGeneration;
    setPreviewingId(selectionInterviewId);
    try {
      const next = await window.jobSearch.reviews.review.preview({
        interviewId: selectionInterviewId,
        selectedAssets,
      });
      if (
        !mounted.current
        || requestGeneration !== previewRequestGeneration.current
      ) {
        try {
          await window.jobSearch.reviews.review.cancelPreview(next.token);
        } catch {
          if (mounted.current) {
            toast.error('预览取消请求失败；页面已关闭，但该令牌可能仍会在过期前有效。');
          }
        }
        return;
      }
      setSelectionInterviewId(null);
      setPreview(next);
    } catch {
      if (mounted.current && requestGeneration === previewRequestGeneration.current) {
        toast.error('暂时无法准备 AI 复盘，请检查设置后重试。');
      }
    } finally {
      if (mounted.current && requestGeneration === previewRequestGeneration.current) {
        setPreviewingId(null);
      }
    }
  };

  const closeReviewModal = async () => {
    previewRequestGeneration.current += 1;
    const token = preview?.token;
    setPreview(null);
    setSelectionInterviewId(null);
    setSelectedAssets(EMPTY_SELECTION);
    setPreviewingId(null);
    if (token) {
      try {
        await window.jobSearch.reviews.review.cancelPreview(token);
      } catch {
        toast.error('预览取消请求失败；页面已关闭，但该令牌可能仍会在过期前有效。');
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
    const interviewId = preview.outbound.interview.id;
    setReviewingId(preview.token);
    try {
      const result = await window.jobSearch.reviews.review.confirm(preview.token);
      resource.setData((current) => (current ?? []).map(
        (item) => item.id === result.interview.id ? result.interview : item,
      ));
      setPreview(null);
      setReviewErrorId(null);
      toast.success('复盘完成，结果已保存在当前面试记录。');
    } catch {
      setPreview(null);
      setReviewErrorId(interviewId);
      toast.error('AI 复盘失败，面试文字未被修改。可重新预览后重试。');
    } finally {
      setReviewingId(null);
    }
  };

  const completeReusableItem = (targetType: InterviewReviewReusableItem['targetType']) => {
    setSelectedReusableItem(null);
    switch (targetType) {
      case 'project': toast.success('已纳入项目档案。'); break;
      case 'question': toast.success('已纳入问题库。'); break;
      case 'capability': toast.success('已纳入能力。'); break;
      case 'insight': toast.success('已纳入心得。'); break;
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      新增面试记录
    </button>
  );

  return (
    <div className="interview-panel">
      {compact ? (
        <header className="interview-panel__header">
          <div><h4>节点面试记录</h4><p>{stageName ?? '当前流程节点'}</p></div>
          {addButton}
        </header>
      ) : (
        <header className="interview-panel__header">
          <div>
            <p className="section-label">INTERVIEW LOG / 面试记录</p>
            <h3>{stageName ?? '先保存事实，再决定是否交给 AI 复盘'}</h3>
            <p>当前版本仅支持手动输入文字；录音转写将在后续阶段提供。</p>
          </div>
          {interviews.length > 0 ? addButton : null}
        </header>
      )}
      {interviewsProp === undefined && resource.loading ? <div className="resource-state" role="status">正在读取面试记录…</div> : null}
      {interviewsProp === undefined && resource.error ? (
        <EmptyState
          action={<button className="button button--quiet" onClick={() => void resource.reload()} type="button">重试</button>}
          body="暂时无法读取本地面试记录。"
          icon="!"
          title="面试记录加载失败"
        />
      ) : null}
      {!resource.loading && !resource.error && interviews.length === 0 ? (
        <EmptyState
          action={compact ? addButton : addButton}
          body={compact ? '在此节点记录本轮面试，保存后可主动发起 AI 复盘。' : '记录轮次、日期与已经确认的文字内容，之后可主动发起 AI 复盘。'}
          icon="面"
          title={compact ? '该节点还没有面试记录' : '还没有面试记录'}
        />
      ) : null}
      <div className="interview-list">
        {interviews.map((item, index) => (
          <details className="position-history" key={item.id} open={index === 0}>
            <summary>
              {index === 0 ? '最新记录' : '历史记录'} · {item.roundName}
              {item.interviewDate ? ` · ${item.interviewDate}` : ''}
            </summary>
            <article className="interview-card">
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
                  disabled={previewingId === item.id || item.reviewSnapshot.status !== 'none'}
                  onClick={() => void beginReview(item.id)}
                  type="button"
                >
                  {item.reviewSnapshot.status !== 'none'
                    ? '已完成 AI 复盘'
                    : previewingId === item.id ? '准备预览…' : '开始 AI 复盘'}
                </button>
              </div>
            </header>
            <section>
              <h5>已确认文字记录</h5>
              <p className="user-text interview-transcript">{item.transcript}</p>
            </section>
            {reviewErrorId === item.id ? (
              <p className="form-error" role="alert">AI 复盘失败，结果未保存；可重新发起复盘。</p>
            ) : null}
            {item.personalNotes ? (
              <section><h5>个人感受 / 补充</h5><p className="user-text">{item.personalNotes}</p></section>
            ) : null}
            {item.summary ? (
              <section className="interview-summary">
                <h5>AI 复盘摘要</h5>
                <p className="user-text">{item.summary}</p>
              </section>
            ) : null}
            <ReviewSnapshot
              interview={item}
              onSelectReusableItem={setSelectedReusableItem}
            />
            {item.feedbackResult ? (
              <section><h5>后续结果 / 反馈</h5><p className="user-text">{item.feedbackResult}</p></section>
            ) : null}
            </article>
          </details>
        ))}
      </div>

      {editing !== undefined ? (
        <InterviewEditor
          initialValue={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSave={save}
          open
          positionId={positionId}
          stageId={stageId}
        />
      ) : null}

      {isReusableItem(selectedReusableItem, 'project') ? (
        <ReviewToProjectEditor
          item={selectedReusableItem}
          onClose={() => setSelectedReusableItem(null)}
          onSaved={() => completeReusableItem('project')}
          open
        />
      ) : null}
      {isReusableItem(selectedReusableItem, 'question') ? (
        <ReviewToQuestionEditor
          item={selectedReusableItem}
          onClose={() => setSelectedReusableItem(null)}
          onSaved={() => completeReusableItem('question')}
          open
        />
      ) : null}
      {isReusableItem(selectedReusableItem, 'capability') ? (
        <ReviewToCapabilityEditor
          item={selectedReusableItem}
          onClose={() => setSelectedReusableItem(null)}
          onSaved={() => completeReusableItem('capability')}
          open
        />
      ) : null}
      {isReusableItem(selectedReusableItem, 'insight') ? (
        <ReviewToInsightEditor
          item={selectedReusableItem}
          onClose={() => setSelectedReusableItem(null)}
          onSaved={() => completeReusableItem('insight')}
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
            <p>未选择资产时，AI 仍可生成本次复盘和可复用内容。</p>
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
                ? <p>未选择资产；AI 仍可生成本次复盘和可复用内容。</p>
                : null}
            </details>
            <p className="form-note">复盘结果保存在当前面试记录；纳入其他模块需后续主动操作。</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
