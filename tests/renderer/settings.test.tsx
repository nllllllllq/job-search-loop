import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SettingsPage } from '../../src/renderer/features/settings/SettingsPage';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { createEmailApiFake, createJobSearchFake, installJobSearchFake } from '../helpers/bridge';
import type { EmailSettingsPublic, EmailSyncEvent, PromptTemplate } from '../../src/shared/domain';

const prompts: PromptTemplate[] = [
  {
    id: '0a8d1dfc-9a87-4d57-9e3c-451c20a6a901',
    kind: 'preparation',
    name: '岗位准备',
    content: '准备原文',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  },
  {
    id: '1b4a8791-78e5-42f2-8da4-a322bb32f9e2',
    kind: 'interview-review',
    name: '面试复盘',
    content: '复盘原文',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  },
  {
    id: '2c4e2b10-52aa-4a0a-b5a3-3e3b9c5e7f03',
    kind: 'capability-analysis',
    name: '共性能力分析',
    content: '分析原文',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  },
  {
    id: 'd5a6f2f5-4eb7-45bd-8ce3-37f4efc1bb64',
    kind: 'project-import',
    name: '项目文件导入',
    content: '按原文识别项目',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
  },
];

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

describe('settings page', () => {
  it('shows a safe unavailable note when email sync is not exposed', async () => {
    const fake = createJobSearchFake();
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    const email = await screen.findByRole('button', { name: /EMAIL \/ 邮箱同步.*招聘邮件自动更新/ });
    await user.click(email);

    expect(await screen.findByText('邮箱同步暂不可用')).toBeVisible();
  });

  it('saves, tests, and syncs email settings without exposing the password', async () => {
    const fake = createJobSearchFake();
    const emailApi = createEmailApiFake();
    const initial: EmailSettingsPublic = {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      email: 'user@example.com',
      username: 'user@example.com',
      enabled: false,
      intervalMinutes: 15,
      hasPassword: false,
      lastUid: 4,
      lastSyncAt: '2026-08-12T08:00:00.000Z',
      lastError: '等待下一次同步',
    };
    const event: EmailSyncEvent = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      messageKey: 'message-1',
      subject: '面试通知',
      sender: 'hr@example.com',
      receivedAt: '2026-08-12T07:00:00.000Z',
      status: 'pending',
      positionId: null,
      canonicalStage: null,
      reason: '未找到唯一匹配岗位',
      createdAt: '2026-08-12T08:00:00.000Z',
    };
    emailApi.settings.get.mockResolvedValue(initial);
    emailApi.settings.save.mockResolvedValue({ ...initial, hasPassword: true, enabled: true });
    emailApi.listRecent.mockResolvedValue([event]);
    fake.email = emailApi;
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /EMAIL \/ 邮箱同步.*招聘邮件自动更新/ }));
    expect(await screen.findByLabelText(/IMAP 主机/)).toHaveValue(initial.host);
    expect(screen.getByLabelText(/密码 \/ 应用授权码/)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(event.subject)).toBeVisible();
    expect(screen.getByText(event.reason)).toBeVisible();
    expect(screen.getByText(initial.lastError!)).toBeVisible();

    await user.click(screen.getByRole('button', { name: '保存邮箱设置' }));
    expect(await screen.findByText('首次保存邮箱同步需要填写密码')).toBeVisible();
    expect(emailApi.settings.save).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/密码 \/ 应用授权码/), 'app-secret');
    await user.click(screen.getByRole('button', { name: '保存邮箱设置' }));
    await waitFor(() => expect(emailApi.settings.save).toHaveBeenCalledWith({
      host: initial.host,
      port: initial.port,
      secure: initial.secure,
      email: initial.email,
      username: initial.username,
      password: 'app-secret',
      enabled: initial.enabled,
      intervalMinutes: initial.intervalMinutes,
    }));
    expect(screen.getByLabelText(/密码 \/ 应用授权码/)).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '测试邮箱连接' }));
    await waitFor(() => expect(emailApi.testConnection).toHaveBeenCalledTimes(1));
    emailApi.syncNow.mockResolvedValueOnce({
      processed: 0,
      applied: 0,
      pending: 0,
      skipped: 0,
      lastUid: initial.lastUid,
      lastSyncAt: initial.lastSyncAt,
      lastError: 'provider details must stay hidden',
    });
    await user.click(screen.getByRole('button', { name: '立即同步' }));
    await waitFor(() => expect(emailApi.syncNow).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('邮箱同步操作失败，请检查配置后重试。', { selector: 'p' })).toBeVisible();
    expect(screen.queryByText('邮箱同步完成')).not.toBeInTheDocument();
    expect(screen.queryByText('provider details must stay hidden')).not.toBeInTheDocument();
    expect(emailApi.listRecent).toHaveBeenCalledWith(5);
  });

  it('keeps settings sections collapsed initially and opens only one at a time', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    const provider = await screen.findByRole('button', { name: /PROVIDER \/ 外部服务.*AI 服务配置/ });
    const prompt = screen.getByRole('button', { name: /WORKING INSTRUCTIONS \/ 工作指令.*Prompt 模板/ });
    const backup = screen.getByRole('button', { name: /ARCHIVE \/ 本地归档.*本地备份与恢复/ });
    expect(provider).toHaveAttribute('aria-expanded', 'false');
    expect(prompt).toHaveAttribute('aria-expanded', 'false');
    expect(backup).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/^API/)).not.toBeInTheDocument();

    await user.click(provider);
    expect(provider).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByLabelText(/^API/)).toBeVisible();
    expect(screen.getByText('API 地址')).toBeVisible();
    expect(screen.getByText('模型')).toBeVisible();
    expect(screen.getByText('替换 API Key')).toBeVisible();
    expect(prompt).toHaveAttribute('aria-expanded', 'false');

    await user.click(prompt);
    expect(provider).toHaveAttribute('aria-expanded', 'false');
    expect(prompt).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByLabelText(/^API/)).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/岗位准备模板/)).toBeVisible();
  });

  it('edits the independent project import prompt', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    fake.assets.prompts.save.mockImplementation(async (kind, content) => ({
      ...prompts.find((prompt) => prompt.kind === kind)!,
      content,
    }));
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /Prompt/ }));
    const editor = await screen.findByLabelText(/^项目文件导入模板/);
    await user.clear(editor);
    await user.type(editor, '只按原文项目边界解析');
    await user.click(screen.getByRole('button', { name: '保存项目文件导入模板' }));

    expect(fake.assets.prompts.save).toHaveBeenCalledWith(
      'project-import',
      '只按原文项目边界解析',
    );
  });

  it('loads public settings without exposing a saved key', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);

    renderSettings();
    await userEvent.setup().click(await screen.findByRole('button', { name: /AI 服务配置/ }));

    expect(await screen.findByDisplayValue('https://api.example.com/v1')).toBeVisible();
    expect(screen.getByDisplayValue('model-a')).toBeVisible();
    expect(screen.getByText('密钥已安全保存在本机')).toBeVisible();
    expect(screen.getByLabelText('替换 API Key')).toHaveValue('');
    expect(screen.queryByDisplayValue(/secret|sk-/i)).not.toBeInTheDocument();
  });

  it('lets users opt in to image inputs and clearly marks file input unavailable', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
      capabilities: { images: false },
    });
    fake.ai.settings.save.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
      capabilities: { images: true },
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    await user.click(await screen.findByLabelText('启用图片输入'));
    expect(screen.getByText('当前 OpenAI-compatible Chat Completions 不支持直接发送原始文件；请使用本地文本提取。')).toBeVisible();
    expect(screen.queryByLabelText('文件输入协议')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));

    await waitFor(() => expect(fake.ai.settings.save).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: '',
      capabilities: {
        images: true,
      },
    }));
  });

  it('keeps edited values after save failure and never echoes secrets', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
    fake.ai.settings.save.mockRejectedValue({
      code: 'AI_AUTH_FAILED',
      message: 'raw provider secret sk-leaked',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    await user.type(await screen.findByLabelText(/^API 地址/), 'https://api.example.com/v1/');
    await user.type(screen.getByLabelText(/^模型/), 'model-a');
    await user.type(screen.getByLabelText('替换 API Key'), 'sk-user-entry');
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));

    expect((await screen.findAllByText('保存失败，请检查配置后重试。'))[0]).toBeVisible();
    expect(screen.getByLabelText(/^API 地址/)).toHaveValue('https://api.example.com/v1/');
    expect(screen.getByLabelText('替换 API Key')).toHaveValue('sk-user-entry');
    expect(document.body).not.toHaveTextContent('sk-leaked');
  });

  it('saves settings and tests the connection only with separate user actions', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.ai.settings.save.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-b',
      hasApiKey: true,
    });
    fake.ai.testConnection.mockResolvedValue({
      ok: true,
      message: '连接成功，可以使用。',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    const model = await screen.findByLabelText(/^模型/);
    await user.clear(model);
    await user.type(model, 'model-b');
    const testButton = screen.getByRole('button', { name: '测试连接' });
    expect(testButton).toBeDisabled();
    expect(screen.getByText('请先保存当前配置')).toBeVisible();
    await user.click(testButton);
    expect(fake.ai.testConnection).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));

    await waitFor(() => expect(fake.ai.settings.save).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-b',
      apiKey: '',
    }));
    expect(fake.ai.testConnection).not.toHaveBeenCalled();

    await waitFor(() => expect(testButton).toBeEnabled());
    expect(screen.queryByText('请先保存当前配置')).not.toBeInTheDocument();
    await user.click(testButton);
    expect(fake.ai.testConnection).toHaveBeenCalledOnce();
    expect((await screen.findAllByText('连接成功，可以使用。'))[0]).toBeVisible();
  });

  it('treats a replacement key as unsaved configuration until it is cleared or saved', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    const key = await screen.findByLabelText('替换 API Key');
    const testButton = screen.getByRole('button', { name: '测试连接' });
    expect(testButton).toBeEnabled();

    await user.type(key, 'new-unsaved-key');
    expect(testButton).toBeDisabled();
    expect(screen.getByText('请先保存当前配置')).toBeVisible();

    await user.clear(key);
    expect(testButton).toBeEnabled();
    expect(screen.queryByText('请先保存当前配置')).not.toBeInTheDocument();
  });

  it('requires a new key before saving a different provider origin', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    const baseUrl = await screen.findByLabelText(/^API 地址/);
    const key = screen.getByLabelText('替换 API Key');
    await user.clear(baseUrl);
    await user.type(baseUrl, 'https://other.example.com/v1');

    expect(screen.getByText(
      '服务地址已变化，必须填写新的 API Key。',
    )).toBeVisible();
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));

    expect(fake.ai.settings.save).not.toHaveBeenCalled();
    expect(screen.getAllByText(
      '服务地址已变化，必须填写新的 API Key。',
    )).toHaveLength(2);
    expect(key).toHaveFocus();
  });

  it('keeps the saved key when a normalized provider origin is unchanged', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.ai.settings.save.mockResolvedValue({
      baseUrl: 'https://api.example.com/v2',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    const baseUrl = await screen.findByLabelText(/^API 地址/);
    await user.clear(baseUrl);
    await user.type(baseUrl, 'https://API.EXAMPLE.com:443/v2/');

    expect(screen.getByText(
      '密钥已安全保存在本机；留空表示保留当前密钥。',
    )).toBeVisible();
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));
    await waitFor(() => expect(fake.ai.settings.save).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com/v2',
      model: 'model-a',
      apiKey: '',
    }));
  });

  it('maps a main-process key requirement to a safe field error', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.ai.settings.save.mockRejectedValue({
      code: 'AI_NOT_CONFIGURED',
      message: 'unsafe internal key detail',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    const model = await screen.findByLabelText(/^模型/);
    const key = screen.getByLabelText('替换 API Key');
    await user.clear(model);
    await user.type(model, 'model-b');
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));

    expect((await screen.findAllByText(
      '当前配置需要重新填写 API Key。',
    ))[0]).toBeVisible();
    expect(key).toHaveFocus();
    expect(document.body).not.toHaveTextContent('unsafe internal key detail');
  });

  it('offers safe in-app recovery for damaged settings with a mandatory new key', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockRejectedValue({
      code: 'AI_SETTINGS_CORRUPT',
      message: 'damaged file contained sk-never-echo',
    });
    fake.ai.settings.save.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-recovered',
      hasApiKey: true,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    expect(await screen.findByText(
      '配置文件已损坏，必须填写新的 API Key 才能覆盖恢复。',
    )).toBeVisible();
    expect(document.body).not.toHaveTextContent('sk-never-echo');

    await user.type(screen.getByLabelText(/^API 地址/), 'https://api.example.com/v1');
    await user.type(screen.getByLabelText(/^模型/), 'model-recovered');
    expect(screen.getByRole('button', { name: '保存 AI 配置' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));
    expect(screen.getByText('首次保存需要填写 API Key。')).toBeVisible();
    expect(fake.ai.settings.save).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('替换 API Key'), 'brand-new-key');
    await user.click(screen.getByRole('button', { name: '保存 AI 配置' }));
    await waitFor(() => expect(fake.ai.settings.save).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-recovered',
      apiKey: 'brand-new-key',
    }));
    expect(screen.getByLabelText('替换 API Key')).toHaveValue('');
    expect(screen.getByRole('button', { name: '测试连接' })).toBeEnabled();
    expect(screen.queryByText(
      '配置文件已损坏，必须填写新的 API Key 才能覆盖恢复。',
    )).not.toBeInTheDocument();
  });

  it('does not offer content-damage recovery for unavailable settings storage', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockRejectedValue({
      code: 'AI_SETTINGS_UNAVAILABLE',
      message: 'sensitive filesystem detail',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);

    renderSettings();
    expect(await screen.findByText('AI 配置读取失败')).toBeVisible();
    expect(screen.getByText(
      '本机 AI 配置暂时无法安全读取。你的 API Key 不会显示在此页面。',
    )).toBeVisible();
    expect(screen.queryByText(
      '配置文件已损坏，必须填写新的 API Key 才能覆盖恢复。',
    )).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存 AI 配置' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('sensitive filesystem detail');
  });

  it('maps connection errors to stable safe Chinese copy', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.ai.testConnection.mockRejectedValue({
      code: 'AI_RATE_LIMITED',
      message: 'provider payload must stay hidden',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    await user.click(await screen.findByRole('button', { name: '测试连接' }));

    expect((await screen.findAllByText('请求过于频繁，请稍后再试。'))[0]).toBeVisible();
    expect(document.body).not.toHaveTextContent('provider payload');
  });

  it('identifies the failed connection capability in safe UI copy', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    fake.ai.testConnection.mockRejectedValue({
      code: 'AI_PROVIDER_ERROR',
      message: 'Responses Web Search connection test failed.',
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /AI 服务配置/ }));
    await user.click(await screen.findByRole('button', { name: '测试连接' }));

    expect((await screen.findAllByText(/Responses Web Search/))[0]).toBeVisible();
  });

  it('saves exact prompt content and keeps it after a failed save', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    fake.assets.prompts.save
      .mockResolvedValueOnce({ ...prompts[0], content: '  新第一行\n\n新第二行  ' })
      .mockRejectedValueOnce(new Error('failure'));
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /Prompt/ }));
    const preparation = await screen.findByLabelText(/^岗位准备模板/);
    await user.clear(preparation);
    await user.type(preparation, '  新第一行\n\n新第二行  ');
    await user.click(screen.getByRole('button', { name: '保存岗位准备模板' }));
    expect(fake.assets.prompts.save).toHaveBeenCalledWith(
      'preparation',
      '  新第一行\n\n新第二行  ',
    );

    const review = screen.getByLabelText(/^面试复盘模板/);
    await user.clear(review);
    await user.type(review, '失败后仍保留');
    await user.click(screen.getByRole('button', { name: '保存面试复盘模板' }));
    expect((await screen.findAllByText('模板保存失败，请稍后重试。'))[0]).toBeVisible();
    expect(review).toHaveValue('失败后仍保留');
  });

  it('rejects blank prompt content before calling the bridge', async () => {
    const fake = createJobSearchFake();
    fake.ai.settings.get.mockResolvedValue({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
    fake.assets.prompts.list.mockResolvedValue(prompts);
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderSettings();
    await user.click(await screen.findByRole('button', { name: /Prompt/ }));
    const analysis = await screen.findByLabelText(/^共性能力分析模板/);
    await user.clear(analysis);
    await user.type(analysis, '   ');
    await user.click(screen.getByRole('button', { name: '保存共性能力分析模板' }));

    expect(screen.getByText('模板内容不能为空。')).toBeVisible();
    expect(fake.assets.prompts.save).not.toHaveBeenCalled();
  });
});
