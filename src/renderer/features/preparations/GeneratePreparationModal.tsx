import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AiTask,
  PreparationGenerateInput,
  PreparationOutboundPreview,
} from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';

interface GeneratePreparationModalProps {
  open: boolean;
  positionId: string;
  onClose: () => void;
  onStarted: (task: AiTask) => void;
}

function errorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as AppError).code
    : null;
  if (code === 'AI_NOT_CONFIGURED') return '尚未配置外部 AI，请先前往设置。';
  if (code === 'AI_AUTH_FAILED') return 'API Key 或访问权限无效。';
  if (code === 'AI_RATE_LIMITED') return '请求过于频繁，请稍后重试。';
  if (code === 'AI_TIMEOUT') return '请求超时，所选内容已保留，可以重试。';
  if (code === 'AI_INVALID_OUTPUT') return 'AI 返回格式无效，请重试。';
  if (code === 'CONFLICT') return '已有准备材料正在生成，请等待当前任务完成后再试。';
  if (code === 'VALIDATION_ERROR') return '所选资产已变化，请返回选择后重试。';
  return '生成失败，所选内容已保留，请稍后重试。';
}

export function GeneratePreparationModal({
  open,
  positionId,
  onClose,
  onStarted,
}: GeneratePreparationModalProps) {
  const toast = useToast();
  const resources = useAsyncResource(async () => {
    const [projects, questions, settings] = await Promise.all([
      window.jobSearch.assets.projects.list(),
      window.jobSearch.assets.questions.list(),
      window.jobSearch.ai.settings.get(),
    ]);
    return { projects, questions, settings };
  });
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreparationOutboundPreview | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PreparationGenerateInput | null>(null);
  const projects = resources.data?.projects ?? [];
  const questions = resources.data?.questions ?? [];
  const settings = resources.data?.settings ?? null;
  const providerOrigin = (() => {
    if (!settings?.baseUrl) return null;
    try {
      return new URL(settings.baseUrl).origin;
    } catch {
      return null;
    }
  })();
  const configured = Boolean(
    settings?.hasApiKey
    && settings.model.trim().length > 0
    && providerOrigin,
  );

  const payload = useMemo<PreparationGenerateInput>(() => ({
    positionId,
    projectIds,
    questionIds,
  }), [positionId, projectIds, questionIds]);

  const toggle = (
    id: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) => {
    setPreview(null);
    setPreviewPayload(null);
    setPreviewError(null);
    setSelected(selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id]);
  };

  const close = () => {
    if (!submitting) onClose();
  };

  const generate = async () => {
    if (submitting || submitted || !previewPayload) return;
    setSubmitting(true);
    setSubmitted(true);
    setError(null);
    try {
      const task = await window.jobSearch.preparations.start(previewPayload);
      onStarted(task);
      onClose();
    } catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      toast.error(message);
      setSubmitting(false);
      setSubmitted(false);
    }
  };

  const showPreview = async () => {
    if (previewing || !configured) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    setPreviewPayload(null);
    const requestedPayload = {
      positionId: payload.positionId,
      projectIds: [...payload.projectIds],
      questionIds: [...payload.questionIds],
    };
    try {
      const next = await window.jobSearch.preparations.preview(requestedPayload);
      setPreview(next);
      setPreviewPayload(requestedPayload);
      setStep('confirm');
    } catch {
      setPreviewError('无法读取实际外发内容，请检查所选档案后重试。当前未调用外部 AI。');
    } finally {
      setPreviewing(false);
    }
  };

  const footer = resources.loading || resources.error ? (
    <button className="button button--quiet" onClick={close} type="button">取消</button>
  ) : step === 'select' ? (
    <>
      <button className="button button--quiet" onClick={close} type="button">取消</button>
      <button
        className="button button--primary"
        disabled={!configured || previewing}
        onClick={() => void showPreview()}
        type="button"
      >
        {previewing ? '正在生成预览…' : '查看发送摘要'}
      </button>
    </>
  ) : (
    <>
      <button
        className="button button--quiet"
        disabled={submitting}
        onClick={close}
        type="button"
      >
        取消
      </button>
      <button
        className="button button--quiet"
        disabled={submitting}
        onClick={() => {
          setPreview(null);
          setPreviewPayload(null);
          setStep('select');
        }}
        type="button"
      >
        返回选择
      </button>
      <button
        className="button button--primary"
        disabled={submitting || submitted || !previewPayload}
        onClick={() => void generate()}
        type="button"
      >
        {submitting ? '生成中…' : '确认生成'}
      </button>
    </>
  );

  return (
    <Modal
      closeDisabled={submitting}
      footer={footer}
      onClose={close}
      open={open}
      title="生成准备材料"
    >
      {resources.loading ? (
        <div className="resource-state preparation-modal__state" role="status">
          <span aria-hidden="true" className="resource-state__mark" />
          正在读取发送范围与可选资产…
        </div>
      ) : null}
      {resources.error ? (
        <div className="preparation-modal__error" role="alert">
          <h3>生成信息载入失败</h3>
          <p>暂时无法读取外部 AI 公开配置或可选资产。当前不会调用外部 AI。</p>
          <button
            className="button button--quiet"
            onClick={() => void resources.reload()}
            type="button"
          >
            重试生成信息
          </button>
        </div>
      ) : null}
      {!resources.loading && !resources.error && step === 'select' ? (
        <div className="preparation-picker">
          {configured ? (
            <p className="preparation-provider">
              当前外部 AI：{providerOrigin} · 模型 {settings?.model}
            </p>
          ) : (
            <div className="preparation-config-warning" role="alert">
              <p>外部 AI 配置尚未完成，完成配置后才能查看发送摘要并生成。</p>
              <Link className="button-link" onClick={close} to="/settings">前往设置</Link>
            </div>
          )}
          <p className="preparation-picker__notice">
            默认不选择任何资产。你可以用 0 项资产生成，只基于当前岗位的原始 JD。
          </p>
          {previewError ? (
            <p className="form-error" role="alert">{previewError}</p>
          ) : null}
          <div className="link-picker-grid">
            <fieldset className="link-picker">
              <legend>选择项目档案</legend>
              {projects.length === 0 ? <p>暂无项目，可保持 0 项。</p> : projects.map((project) => (
                <label className="user-text" key={project.id}>
                  <input
                    checked={projectIds.includes(project.id)}
                    disabled={previewing}
                    onChange={() => toggle(project.id, projectIds, setProjectIds)}
                    type="checkbox"
                  />
                  项目：{project.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="link-picker">
              <legend>选择问题条目</legend>
              {questions.length === 0 ? <p>暂无问题，可保持 0 项。</p> : questions.map((question) => (
                <label className="user-text" key={question.id}>
                  <input
                    checked={questionIds.includes(question.id)}
                    disabled={previewing}
                    onChange={() => toggle(question.id, questionIds, setQuestionIds)}
                    type="checkbox"
                  />
                  问题：{question.text}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
      ) : null}
      {!resources.loading
        && !resources.error
        && step === 'confirm'
        && preview
        && previewPayload ? (
        <div className="payload-summary">
          <p className="section-label">OUTBOUND DATA / 发送前确认</p>
          <h3>预计载荷摘要</h3>
          <p className="payload-summary__destination">
            目标服务：{providerOrigin} · 模型 {settings?.model}
          </p>
          <ul className="payload-summary__contents">
            <li>公司与岗位名称的完整内容</li>
            <li>原始 JD：完整原文（{preview.position.rawJd.length} 个字符）</li>
            <li>
              当前「岗位准备」Prompt 模板完整内容
              （{preview.prompt.length} 个字符）
            </li>
            <li>{preview.selectedAssets.projects.length} 个所选项目档案的完整字段内容</li>
            <li>{preview.selectedAssets.questions.length} 个所选问题条目的完整字段内容</li>
          </ul>
          <section className="outbound-preview" aria-label="实际外发内容预览">
            <h4>实际外发内容预览</h4>
            <p>以下内容由主进程按实际请求的数据契约读取，默认折叠。</p>
            <details>
              <summary>完整公司与岗位</summary>
              <dl>
                <div><dt>公司</dt><dd className="user-text">{preview.position.company}</dd></div>
                <div><dt>岗位</dt><dd className="user-text">{preview.position.title}</dd></div>
              </dl>
            </details>
            <details>
              <summary>完整原始 JD</summary>
              <pre className="user-text">{preview.position.rawJd}</pre>
            </details>
            <details>
              <summary>当前岗位准备 Prompt 原文</summary>
              <pre className="user-text">{preview.prompt}</pre>
            </details>
            {preview.selectedAssets.projects.map((project, index) => (
              <details key={project.id}>
                <summary className="user-text">
                  项目档案 {index + 1}：{project.name}
                </summary>
                <pre className="user-text">{JSON.stringify(project, null, 2)}</pre>
              </details>
            ))}
            {preview.selectedAssets.questions.map((question, index) => (
              <details key={question.id}>
                <summary className="user-text">
                  问题档案 {index + 1}：{question.text}
                </summary>
                <pre className="user-text">{JSON.stringify(question, null, 2)}</pre>
              </details>
            ))}
            <details>
              <summary>实际请求中的岗位数据 JSON</summary>
              <pre className="user-text">{preview.jobDataJson}</pre>
            </details>
          </section>
          <p className="payload-summary__warning">
            确认后，列表中逐类说明的完整内容将发送到该外部 AI。
            生成时主进程会再次读取最新外部 AI 配置与「岗位准备」Prompt；
            如果预览后数据发生变化，最终外发内容可能与本预览不同，
            请返回选择并重新查看预览后再确认。
            应用只保存通过本地校验的生成结果与本次输入快照。
          </p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
