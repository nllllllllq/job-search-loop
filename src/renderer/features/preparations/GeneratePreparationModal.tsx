import { useState } from 'react';
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
  const appError = typeof error === 'object' && error !== null && 'code' in error
    ? error as AppError
    : null;
  if (appError?.code === 'AI_NOT_CONFIGURED') return '尚未配置外部 AI，请先前往设置。';
  if (appError?.code === 'AI_AUTH_FAILED') return 'API Key 或访问权限无效。';
  if (appError?.code === 'AI_RATE_LIMITED') return '请求过于频繁，请稍后重试。';
  if (appError?.code === 'AI_TIMEOUT') return '请求超时，可以稍后重新生成。';
  if (appError?.code === 'AI_INVALID_OUTPUT') return 'AI 返回格式无效，请重新生成。';
  if (appError?.code === 'CONFLICT') return '已有准备材料正在生成，请等待当前任务完成。';
  return appError?.message || '生成失败，请稍后重试。';
}

export function GeneratePreparationModal({
  open,
  positionId,
  onClose,
  onStarted,
}: GeneratePreparationModalProps) {
  const toast = useToast();
  const settingsResource = useAsyncResource(() => window.jobSearch.ai.settings.get(), []);
  const [step, setStep] = useState<'start' | 'confirm'>('start');
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreparationOutboundPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = settingsResource.data;
  const payload: PreparationGenerateInput = { positionId };
  const providerOrigin = (() => {
    try {
      return settings?.baseUrl ? new URL(settings.baseUrl).origin : null;
    } catch {
      return null;
    }
  })();
  const configured = Boolean(settings?.hasApiKey && settings.model.trim() && providerOrigin);

  const showPreview = async () => {
    if (!configured || previewing) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await window.jobSearch.preparations.preview(payload));
      setStep('confirm');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPreviewing(false);
    }
  };

  const generate = async () => {
    if (!preview || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await window.jobSearch.preparations.start(payload);
      onStarted(task);
      onClose();
    } catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  };

  const footer = step === 'start' ? (
    <button
      className="button button--primary"
      disabled={!configured || previewing || settingsResource.loading}
      onClick={() => void showPreview()}
      type="button"
    >
      {previewing ? '正在准备预览…' : '查看发送内容'}
    </button>
  ) : (
    <>
      <button
        className="button button--quiet"
        disabled={submitting}
        onClick={() => setStep('start')}
        type="button"
      >
        返回
      </button>
      <button
        className="button button--primary"
        disabled={submitting || !preview}
        onClick={() => void generate()}
        type="button"
      >
        {submitting ? '正在启动…' : '确认生成'}
      </button>
    </>
  );

  return (
    <Modal
      closeDisabled={submitting}
      footer={footer}
      onClose={onClose}
      open={open}
      title="生成准备材料"
    >
      {settingsResource.loading ? <div className="resource-state" role="status">正在读取 AI 配置…</div> : null}
      {settingsResource.error ? (
        <div className="preparation-modal__error" role="alert">
          <p>AI 配置读取失败，当前不会发送任何内容。</p>
          <button className="button button--quiet" onClick={() => void settingsResource.reload()} type="button">重试</button>
        </div>
      ) : null}
      {!settingsResource.loading && !settingsResource.error && !configured ? (
        <div className="preparation-config-warning" role="alert">
          <p>外部 AI 配置尚未完成。请先填写豆包服务地址、Doubao-Seed-2.0-mini 模型和 API Key。</p>
          <Link className="button-link" onClick={onClose} to="/settings">前往设置</Link>
        </div>
      ) : null}
      {!settingsResource.loading && !settingsResource.error && configured && step === 'start' ? (
        <div className="preparation-picker">
          <p className="preparation-provider">当前服务：{providerOrigin} · 模型 {settings?.model}</p>
          <p className="preparation-picker__notice">
            准备材料只使用当前岗位的公司、岗位、可选地点、完整 JD 与岗位准备 Prompt。
            模型会自行联网调研公司和岗位可能负责的产品，不会读取项目档案或问题库。
          </p>
        </div>
      ) : null}
      {step === 'confirm' && preview ? (
        <div className="payload-summary">
          <p className="section-label">OUTBOUND DATA / 发送前确认</p>
          <h3>岗位研究与准备范围</h3>
          <ul className="payload-summary__contents">
            <li>公司：{preview.position.company}</li>
            <li>岗位：{preview.position.title}</li>
            {preview.position.location ? <li>地点：{preview.position.location}</li> : null}
            <li>完整 JD：{preview.position.rawJd.length} 个字符</li>
            <li>当前岗位准备 Prompt：{preview.prompt.length} 个字符</li>
            <li>启用模型联网搜索，用于公司与产品调研</li>
          </ul>
          <details className="outbound-preview">
            <summary>查看完整 JD 与 Prompt</summary>
            <h4>完整 JD</h4>
            <pre className="user-text">{preview.position.rawJd}</pre>
            <h4>岗位准备 Prompt</h4>
            <pre className="user-text">{preview.prompt}</pre>
          </details>
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}
