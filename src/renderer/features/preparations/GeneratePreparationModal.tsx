import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  PreparationGenerateInput,
  PreparationMaterial,
} from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';

interface GeneratePreparationModalProps {
  open: boolean;
  positionId: string;
  company: string;
  title: string;
  rawJdLength: number;
  onClose: () => void;
  onGenerated: (preparation: PreparationMaterial) => Promise<void>;
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
  if (code === 'VALIDATION_ERROR') return '所选资产已变化，请返回选择后重试。';
  return '生成失败，所选内容已保留，请稍后重试。';
}

export function GeneratePreparationModal({
  open,
  positionId,
  company,
  title,
  rawJdLength,
  onClose,
  onGenerated,
}: GeneratePreparationModalProps) {
  const toast = useToast();
  const resources = useAsyncResource(async () => {
    const [projects, questions, settings, prompt] = await Promise.all([
      window.jobSearch.assets.projects.list(),
      window.jobSearch.assets.questions.list(),
      window.jobSearch.ai.settings.get(),
      window.jobSearch.assets.prompts.get('preparation'),
    ]);
    return { projects, questions, settings, prompt };
  });
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const projects = resources.data?.projects ?? [];
  const questions = resources.data?.questions ?? [];
  const settings = resources.data?.settings ?? null;
  const prompt = resources.data?.prompt ?? null;
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
    setSelected(selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id]);
  };

  const close = () => {
    if (!submitting) onClose();
  };

  const generate = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    setError(null);
    try {
      const saved = await window.jobSearch.preparations.generate(payload);
      await onGenerated(saved);
    } catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      toast.error(message);
      setSubmitting(false);
      setSubmitted(false);
    }
  };

  const footer = resources.loading || resources.error ? (
    <button className="button button--quiet" onClick={close} type="button">取消</button>
  ) : step === 'select' ? (
    <>
      <button className="button button--quiet" onClick={close} type="button">取消</button>
      <button
        className="button button--primary"
        disabled={!configured}
        onClick={() => {
          setError(null);
          setStep('confirm');
        }}
        type="button"
      >
        查看发送摘要
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
        onClick={() => setStep('select')}
        type="button"
      >
        返回选择
      </button>
      <button
        className="button button--primary"
        disabled={submitting || submitted}
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
          <p>暂时无法读取外部 AI 公开配置、Prompt 或可选资产。当前不会调用外部 AI。</p>
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
          <div className="link-picker-grid">
            <fieldset className="link-picker">
              <legend>选择项目档案</legend>
              {projects.length === 0 ? <p>暂无项目，可保持 0 项。</p> : projects.map((project) => (
                <label className="user-text" key={project.id}>
                  <input
                    checked={projectIds.includes(project.id)}
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
      {!resources.loading && !resources.error && step === 'confirm' ? (
        <div className="payload-summary">
          <p className="section-label">OUTBOUND DATA / 发送前确认</p>
          <h3>预计载荷摘要</h3>
          <p className="payload-summary__destination">
            目标服务：{providerOrigin} · 模型 {settings?.model}
          </p>
          <ul className="payload-summary__contents">
            <li>公司与岗位名称的完整内容：{company} · {title}</li>
            <li>原始 JD：完整原文（{rawJdLength} 个字符）</li>
            <li>
              当前「岗位准备」Prompt 模板完整内容
              （{prompt?.content.length ?? 0} 个字符）
            </li>
            <li>{projectIds.length} 个所选项目档案的完整字段内容</li>
            <li>{questionIds.length} 个所选问题条目的完整字段内容</li>
          </ul>
          <p className="payload-summary__warning">
            确认后，列表中逐类说明的完整内容将发送到该外部 AI。
            生成时主进程会再次读取最新外部 AI 配置与「岗位准备」Prompt；
            如果它们在弹窗打开后发生变化，以确认生成时读取的内容为准。
            应用只保存通过本地校验的生成结果与本次输入快照。
          </p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
