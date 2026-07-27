import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  AiPublicSettings,
  PromptTemplate,
} from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import {
  aiBaseUrlSchema,
  aiSettingsSaveSchema,
} from '../../../shared/schemas';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { PromptTemplatesSection } from './PromptTemplatesSection';
import { BackupSection } from './BackupSection';

function errorCode(error: unknown): AppError['code'] | null {
  if (
    error !== null
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code as AppError['code'];
  }
  return null;
}

const changedOriginKeyMessage = '服务地址已变化，必须填写新的 API Key。';
const replacementKeyMessage = '当前配置需要重新填写 API Key。';

function normalizedProviderOrigin(value: string): string | null {
  const parsed = aiBaseUrlSchema.safeParse(value);
  return parsed.success ? new URL(parsed.data).origin : null;
}

function connectionErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'AI_NOT_CONFIGURED':
      return '请先保存完整的 API 地址、模型和密钥。';
    case 'AI_AUTH_FAILED':
      return '认证失败，请检查 API Key 与访问权限。';
    case 'AI_RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    case 'AI_TIMEOUT':
      return '连接测试超时，请检查网络或服务地址。';
    case 'AI_INVALID_OUTPUT':
      return '服务已响应，但返回格式不符合要求。';
    case 'AI_SETTINGS_CORRUPT':
      return '本机 AI 配置文件已损坏，请重新配置。';
    case 'AI_SETTINGS_UNAVAILABLE':
      return '本机安全存储暂时不可用。';
    default:
      return '连接失败，请检查地址、网络与服务状态。';
  }
}

export function SettingsPage() {
  const settings = useAsyncResource(() => window.jobSearch.ai.settings.get());
  const prompts = useAsyncResource(() => window.jobSearch.assets.prompts.list());
  const toast = useToast();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [publicSettings, setPublicSettings] = useState<AiPublicSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [testMessage, setTestMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const settingsCorrupt = errorCode(settings.error) === 'AI_SETTINGS_CORRUPT';

  useEffect(() => {
    if (settings.data) {
      setBaseUrl(settings.data.baseUrl);
      setModel(settings.data.model);
      setPublicSettings(settings.data);
      return;
    }
    if (settingsCorrupt) {
      setBaseUrl('');
      setModel('');
      setApiKey('');
      setPublicSettings({
        baseUrl: '',
        model: '',
        hasApiKey: false,
      });
    }
  }, [settings.data, settingsCorrupt]);

  const effectivePublicSettings = publicSettings ?? (settingsCorrupt ? {
    baseUrl: '',
    model: '',
    hasApiKey: false,
  } : null);
  const settingsDirty = effectivePublicSettings !== null && (
    baseUrl !== effectivePublicSettings.baseUrl
    || model !== effectivePublicSettings.model
    || apiKey.length > 0
  );
  const savedOrigin = effectivePublicSettings?.hasApiKey
    ? normalizedProviderOrigin(effectivePublicSettings.baseUrl)
    : null;
  const currentOrigin = normalizedProviderOrigin(baseUrl);
  const providerOriginChanged = (
    effectivePublicSettings?.hasApiKey === true
    && currentOrigin !== null
    && currentOrigin !== savedOrigin
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || testing) return;
    const parsed = aiSettingsSaveSchema.safeParse({ baseUrl, model, apiKey });
    if (!parsed.success) {
      setFormError('请填写有效的 HTTP/HTTPS 地址、模型和密钥。');
      setApiKeyError(null);
      return;
    }
    if (!effectivePublicSettings?.hasApiKey && apiKey.trim().length === 0) {
      setFormError(null);
      setApiKeyError('首次保存需要填写 API Key。');
      apiKeyRef.current?.focus();
      return;
    }
    if (providerOriginChanged && parsed.data.apiKey.trim().length === 0) {
      setFormError(null);
      setApiKeyError(changedOriginKeyMessage);
      apiKeyRef.current?.focus();
      return;
    }

    setSaving(true);
    setFormError(null);
    setApiKeyError(null);
    const submittedOriginChanged = (
      effectivePublicSettings?.hasApiKey === true
      && normalizedProviderOrigin(parsed.data.baseUrl) !== savedOrigin
    );
    try {
      const saved = await window.jobSearch.ai.settings.save(parsed.data);
      settings.setData(saved);
      setPublicSettings(saved);
      setBaseUrl(saved.baseUrl);
      setModel(saved.model);
      setApiKey('');
      setApiKeyError(null);
      toast.success('AI 配置已安全保存');
    } catch (error) {
      if (
        errorCode(error) === 'AI_NOT_CONFIGURED'
        && parsed.data.apiKey.trim().length === 0
      ) {
        const message = submittedOriginChanged
          ? changedOriginKeyMessage
          : replacementKeyMessage;
        setFormError(null);
        setApiKeyError(message);
        apiKeyRef.current?.focus();
        toast.error(message);
        return;
      }
      setFormError('保存失败，请检查配置后重试。');
      toast.error('保存失败，请检查配置后重试。');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (saving || testing || settingsDirty) return;
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await window.jobSearch.ai.testConnection();
      setTestMessage({ tone: 'success', text: result.message });
      toast.success(result.message);
    } catch (error) {
      const message = connectionErrorMessage(error);
      setTestMessage({ tone: 'error', text: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const promptSaved = (saved: PromptTemplate) => {
    prompts.setData((current) => (
      current?.map((prompt) => (
        prompt.kind === saved.kind ? saved : prompt
      )) ?? [saved]
    ));
  };

  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <p className="section-label">LOCAL CONTROL / 本机控制</p>
          <h2>只在需要时，连接你的 AI</h2>
          <p>密钥由系统安全存储加密；应用不会自动调用外部服务，也不会记录请求日志或遥测。</p>
        </div>
        <span className="settings-page__privacy">LOCAL · EXPLICIT · ENCRYPTED</span>
      </header>

      {settings.loading || (!settings.error && settings.data && !publicSettings) ? (
        <div className="resource-state" role="status">
          <span className="resource-state__mark" aria-hidden="true" />
          正在读取本机 AI 配置…
        </div>
      ) : null}
      {settingsCorrupt ? (
        <section className="settings-recovery-warning" role="alert">
          <p className="section-label">RECOVERY / 安全恢复</p>
          <h3>AI 配置需要重新建立</h3>
          <p>配置文件已损坏，必须填写新的 API Key 才能覆盖恢复。</p>
        </section>
      ) : null}
      {settings.error && !settingsCorrupt ? (
        <EmptyState
          body="本机 AI 配置暂时无法安全读取。你的 API Key 不会显示在此页面。"
          icon="！"
          title="AI 配置读取失败"
        />
      ) : null}
      {!settings.loading && effectivePublicSettings ? (
        <section
          aria-labelledby="ai-provider-title"
          className="settings-section settings-provider"
        >
          <div className="settings-section__heading">
            <div>
              <p className="section-label">PROVIDER / 外部服务</p>
              <h3 id="ai-provider-title">OpenAI-compatible 配置</h3>
            </div>
            <p>保存只更新本机配置；“测试连接”是独立、由你主动触发的一次最小请求。</p>
          </div>
          <form className="settings-provider__form" noValidate onSubmit={submit}>
            <Field
              hint="示例：https://api.example.com/v1"
              label="API 地址"
              required
            >
              <input
                autoComplete="url"
                maxLength={2_000}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  setFormError(null);
                  setApiKeyError(null);
                  setTestMessage(null);
                }}
                placeholder="https://api.example.com/v1"
                type="url"
                value={baseUrl}
              />
            </Field>
            <Field label="模型" required>
              <input
                autoComplete="off"
                maxLength={500}
                onChange={(event) => {
                  setModel(event.target.value);
                  setFormError(null);
                  setTestMessage(null);
                }}
                placeholder="例如 model-a"
                value={model}
              />
            </Field>
            <Field
              error={apiKeyError}
              hint={
                providerOriginChanged
                  ? changedOriginKeyMessage
                  : effectivePublicSettings.hasApiKey
                  ? '密钥已安全保存在本机；留空表示保留当前密钥。'
                  : '密钥不会被回读或显示；首次保存必须填写。'
              }
              label="替换 API Key"
            >
              <input
                autoComplete="new-password"
                maxLength={10_000}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setFormError(null);
                  setApiKeyError(null);
                  setTestMessage(null);
                }}
                ref={apiKeyRef}
                type="password"
                value={apiKey}
              />
            </Field>
            <div className="settings-provider__status">
              <span
                className={`settings-key-state${
                  effectivePublicSettings.hasApiKey ? ' settings-key-state--saved' : ''
                }`}
              >
                {effectivePublicSettings.hasApiKey
                  ? '密钥已安全保存在本机'
                  : '尚未保存 API Key'}
              </span>
              {formError ? <p role="alert">{formError}</p> : null}
              {settingsDirty ? <p>请先保存当前配置</p> : null}
              {testMessage ? (
                <p className={`connection-result connection-result--${testMessage.tone}`} role="status">
                  {testMessage.text}
                </p>
              ) : null}
            </div>
            <div className="settings-provider__actions">
              <button
                className="button button--primary"
                disabled={saving || testing}
                type="submit"
              >
                {saving ? '保存中…' : '保存 AI 配置'}
              </button>
              <button
                className="button button--quiet"
                disabled={
                  saving
                  || testing
                  || settingsDirty
                  || !effectivePublicSettings.hasApiKey
                }
                onClick={() => void testConnection()}
                type="button"
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {prompts.loading ? (
        <div className="resource-state" role="status">
          <span className="resource-state__mark" aria-hidden="true" />
          正在读取 Prompt 模板…
        </div>
      ) : null}
      {prompts.error ? (
        <EmptyState
          body="Prompt 模板暂时无法读取；本机已有内容没有被修改。"
          icon="！"
          title="Prompt 模板读取失败"
        />
      ) : null}
      {prompts.data ? (
        <PromptTemplatesSection
          onSaved={promptSaved}
          prompts={prompts.data}
        />
      ) : null}
      <BackupSection />
    </div>
  );
}
