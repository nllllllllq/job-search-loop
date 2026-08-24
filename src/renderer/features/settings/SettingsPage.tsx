import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  AiPublicSettings,
  EmailSettingsPublic,
  EmailSyncEvent,
  PromptTemplate,
} from '../../../shared/domain';
import { defaultAiModelCapabilities } from '../../../shared/domain';
import type { AppError } from '../../../shared/ipc';
import {
  aiBaseUrlSchema,
  aiSettingsSaveSchema,
  emailSettingsSaveSchema,
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
  const detail = (
    error !== null
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) ? error.message : '';
  if (detail.includes('Responses Web Search')) {
    return 'Responses Web Search 连接测试失败，请检查岗位准备所需的 Web Search 能力。';
  }
  if (detail.includes('Chat JSON')) {
    return 'Chat JSON 连接测试失败，请检查普通 JSON 对话能力。';
  }
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

function emailErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'EMAIL_NOT_CONFIGURED':
      return '请先保存完整的邮箱同步配置。';
    case 'EMAIL_CONNECTION_FAILED':
      return '邮箱连接失败，请检查 IMAP 主机、端口与授权码。';
    case 'EMAIL_SETTINGS_CORRUPT':
      return '本地邮箱配置已损坏，请重新保存配置。';
    case 'EMAIL_SETTINGS_UNAVAILABLE':
      return '本地邮箱安全存储暂时不可用。';
    default:
      return '邮箱同步操作失败，请检查配置后重试。';
  }
}

interface EmailResourceData {
  settings: EmailSettingsPublic;
  events: EmailSyncEvent[];
}

function EmailSyncSection() {
  const emailApi = window.jobSearch.email;
  const resource = useAsyncResource<EmailResourceData | null>(
    async () => {
      if (!emailApi) return null;
      const [settings, events] = await Promise.all([
        emailApi.settings.get(),
        emailApi.listRecent(5),
      ]);
      return { settings, events };
    },
    [emailApi],
  );
  const toast = useToast();
  const [savedSettings, setSavedSettings] = useState<EmailSettingsPublic | null>(null);
  const [email, setEmail] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loaded = resource.data?.settings;
    if (!loaded) return;
    setSavedSettings(loaded);
    setEmail(loaded.email);
    setHost(loaded.host);
    setPort(loaded.port);
    setUsername(loaded.username);
    setSecure(loaded.secure);
    setEnabled(loaded.enabled);
    setIntervalMinutes(loaded.intervalMinutes);
    setPassword('');
    setFormError(null);
  }, [resource.data?.settings]);

  if (!emailApi) {
    return <p className="settings-email__unavailable" role="status">邮箱同步暂不可用</p>;
  }

  const data = resource.data;
  const isDirty = savedSettings !== null && (
    email !== savedSettings.email
    || host !== savedSettings.host
    || port !== savedSettings.port
    || username !== savedSettings.username
    || secure !== savedSettings.secure
    || enabled !== savedSettings.enabled
    || intervalMinutes !== savedSettings.intervalMinutes
    || password.length > 0
  );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || testing || syncing) return;
    if (!savedSettings?.hasPassword && password.trim().length === 0) {
      setFormError('首次保存邮箱同步需要填写密码');
      return;
    }
    const parsed = emailSettingsSaveSchema.safeParse({
      host,
      port,
      secure,
      email,
      username,
      password,
      enabled,
      intervalMinutes,
    });
    if (!parsed.success) {
      setFormError('请填写有效的邮箱、IMAP 主机、端口和用户名');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await emailApi.settings.save(parsed.data);
      setSavedSettings(saved);
      setPassword('');
      resource.setData((current) => current ? { ...current, settings: saved } : { settings: saved, events: [] });
      toast.success('邮箱同步设置已保存');
    } catch (error) {
      const message = emailErrorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (saving || testing || syncing || isDirty || !savedSettings) return;
    setTesting(true);
    setActionMessage(null);
    try {
      await emailApi.testConnection();
      setActionMessage({ tone: 'success', text: '邮箱连接测试成功' });
      toast.success('邮箱连接测试成功');
    } catch (error) {
      const message = emailErrorMessage(error);
      setActionMessage({ tone: 'error', text: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    if (saving || testing || syncing || isDirty || !savedSettings) return;
    setSyncing(true);
    setActionMessage(null);
    try {
      const result = await emailApi.syncNow();
      await resource.reload();
      if (result.lastError !== null) {
        const message = emailErrorMessage(null);
        setActionMessage({ tone: 'error', text: message });
        toast.error(message);
        return;
      }
      setActionMessage({ tone: 'success', text: `邮箱同步完成，处理 ${result.processed} 封邮件` });
      toast.success('邮箱同步完成');
    } catch (error) {
      const message = emailErrorMessage(error);
      setActionMessage({ tone: 'error', text: message });
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section aria-labelledby="email-sync-title" className="settings-section settings-email">
      <div className="settings-section__heading">
        <div>
          <p className="section-label">EMAIL / 邮箱同步</p>
          <h3 id="email-sync-title">招聘邮件自动更新</h3>
        </div>
        <p>仅读取收件箱中的招聘通知，不保存邮件正文或附件。</p>
      </div>
      {resource.loading ? <p className="settings-email__state" role="status">正在读取邮箱同步状态…</p> : null}
      {resource.error ? <p className="settings-email__state" role="alert">邮箱同步状态读取失败，请稍后重试。</p> : null}
      {data ? (
        <>
          <form className="settings-email__form" noValidate onSubmit={save}>
            <Field label="邮箱地址" required>
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            </Field>
            <Field label="IMAP 主机" required>
              <input autoComplete="url" onChange={(event) => setHost(event.target.value)} value={host} />
            </Field>
            <Field label="端口" required>
              <input min={1} max={65_535} onChange={(event) => setPort(Number(event.target.value))} type="number" value={port} />
            </Field>
            <Field label="用户名" required>
              <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} value={username} />
            </Field>
            <Field hint={savedSettings?.hasPassword ? '留空表示保留已保存的授权码。' : '首次保存必须填写授权码或应用密码。'} label="密码 / 应用授权码" required={!savedSettings?.hasPassword}>
              <input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </Field>
            <Field label="同步间隔">
              <select onChange={(event) => setIntervalMinutes(Number(event.target.value))} value={intervalMinutes}>
                {[5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
              </select>
            </Field>
            <div className="settings-email__checks">
              <label className="field--checkbox">
                <input checked={secure} onChange={(event) => setSecure(event.target.checked)} type="checkbox" />
                <span>启用 TLS</span>
              </label>
              <label className="field--checkbox">
                <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
                <span>启用自动同步</span>
              </label>
            </div>
            <div className="settings-email__actions">
              <button className="button button--primary" disabled={saving || testing || syncing} type="submit">
                {saving ? '保存中…' : '保存邮箱设置'}
              </button>
              <button className="button button--quiet" disabled={saving || testing || syncing || isDirty || !savedSettings} onClick={() => void testConnection()} type="button">
                {testing ? '测试中…' : '测试邮箱连接'}
              </button>
              <button className="button button--quiet" disabled={saving || testing || syncing || isDirty || !savedSettings} onClick={() => void syncNow()} type="button">
                {syncing ? '同步中…' : '立即同步'}
              </button>
            </div>
          </form>
          <div className="settings-email__status" aria-label="邮箱同步状态">
            <dl>
              <div><dt>最近同步</dt><dd>{data.settings.lastSyncAt ?? '尚未同步'}</dd></div>
              <div><dt>最近安全错误</dt><dd>{data.settings.lastError ?? '无'}</dd></div>
            </dl>
            {formError ? <p role="alert">{formError}</p> : null}
            {actionMessage ? <p className={`connection-result--${actionMessage.tone}`} role="status">{actionMessage.text}</p> : null}
            {isDirty ? <p>请先保存当前邮箱配置</p> : null}
          </div>
          <section aria-label="最近同步事件" className="settings-email__events">
            <h4>最近同步事件</h4>
            {data.events.length === 0 ? <p>暂无同步事件</p> : (
              <ul>
                {data.events.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <strong>{event.subject || '无主题'}</strong>
                    <span>{event.status === 'applied' ? '已写入' : '待匹配'}</span>
                    <p>{event.reason || '无补充原因'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

export function SettingsPage() {
  const settings = useAsyncResource(() => window.jobSearch.ai.settings.get());
  const prompts = useAsyncResource(() => window.jobSearch.assets.prompts.list());
  const toast = useToast();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [imageInputEnabled, setImageInputEnabled] = useState(
    defaultAiModelCapabilities.images,
  );
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
  const [openSection, setOpenSection] = useState<'provider' | 'prompts' | 'backup' | 'email' | null>(null);
  const settingsCorrupt = errorCode(settings.error) === 'AI_SETTINGS_CORRUPT';

  useEffect(() => {
    if (settings.data) {
      setBaseUrl(settings.data.baseUrl);
      setModel(settings.data.model);
      setImageInputEnabled(
        settings.data.capabilities?.images ?? defaultAiModelCapabilities.images,
      );
      setPublicSettings(settings.data);
      return;
    }
    if (settingsCorrupt) {
      setBaseUrl('');
      setModel('');
      setApiKey('');
      setImageInputEnabled(defaultAiModelCapabilities.images);
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
  const effectiveCapabilities = effectivePublicSettings?.capabilities
    ?? defaultAiModelCapabilities;
  const settingsDirty = effectivePublicSettings !== null && (
    baseUrl !== effectivePublicSettings.baseUrl
    || model !== effectivePublicSettings.model
    || apiKey.length > 0
    || imageInputEnabled !== effectiveCapabilities.images
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
    const capabilities = { images: imageInputEnabled };
    const shouldPersistCapabilities = imageInputEnabled
      || effectivePublicSettings?.capabilities !== undefined;
    const parsed = aiSettingsSaveSchema.safeParse({
      baseUrl,
      model,
      apiKey,
      ...(shouldPersistCapabilities ? { capabilities } : {}),
    });
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
      setImageInputEnabled(
        saved.capabilities?.images ?? defaultAiModelCapabilities.images,
      );
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

  const toggleSection = (section: 'provider' | 'prompts' | 'backup' | 'email') => {
    setOpenSection((current) => (current === section ? null : section));
  };

  const sectionToggle = (
    section: 'provider' | 'prompts' | 'backup' | 'email',
    label: string,
    summary: string,
  ) => {
    const expanded = openSection === section;
    return (
      <button
        aria-controls={`settings-panel-${section}`}
        aria-expanded={expanded}
        className="settings-accordion__toggle"
        onClick={() => toggleSection(section)}
        type="button"
      >
        <span>
          <span className="section-label">{label}</span>
          <strong>{summary}</strong>
        </span>
        <span aria-hidden="true" className="settings-accordion__chevron">{expanded ? '−' : '+'}</span>
      </button>
    );
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
        <section className="settings-accordion" aria-label="AI provider settings">
          {sectionToggle('provider', 'PROVIDER / 外部服务', 'AI 服务配置')}
          {openSection === 'provider' ? <div id="settings-panel-provider" className="settings-accordion__panel">
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
              hint="只在当前模型明确支持图片输入时启用。"
              label="启用图片输入"
            >
              <input
                checked={imageInputEnabled}
                onChange={(event) => {
                  setImageInputEnabled(event.target.checked);
                  setFormError(null);
                  setTestMessage(null);
                }}
                type="checkbox"
              />
            </Field>
            <div className="field">
              <p className="field__label">文件输入</p>
              <p className="field__hint">
                当前 OpenAI-compatible Chat Completions 不支持直接发送原始文件；请使用本地文本提取。
              </p>
            </div>
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
          </div> : null}
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
        <section className="settings-accordion" aria-label="Prompt settings">
          {sectionToggle('prompts', 'WORKING INSTRUCTIONS / 工作指令', 'Prompt 模板')}
          {openSection === 'prompts' ? <div id="settings-panel-prompts" className="settings-accordion__panel">
            <PromptTemplatesSection onSaved={promptSaved} prompts={prompts.data} />
          </div> : null}
        </section>
      ) : null}
      <section className="settings-accordion" aria-label="Backup settings">
        {sectionToggle('backup', 'ARCHIVE / 本地归档', '本地备份与恢复')}
        {openSection === 'backup' ? <div id="settings-panel-backup" className="settings-accordion__panel"><BackupSection /></div> : null}
      </section>
      <section className="settings-accordion" aria-label="Email sync settings">
        {sectionToggle('email', 'EMAIL / 邮箱同步', '招聘邮件自动更新')}
        {openSection === 'email' ? <div id="settings-panel-email" className="settings-accordion__panel"><EmailSyncSection /></div> : null}
      </section>
    </div>
  );
}
