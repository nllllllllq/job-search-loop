import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SettingsPage } from '../../src/renderer/features/settings/SettingsPage';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { createJobSearchFake, installJobSearchFake } from '../helpers/bridge';
import type { PromptTemplate } from '../../src/shared/domain';

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
];

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

describe('settings page', () => {
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

    expect(await screen.findByDisplayValue('https://api.example.com/v1')).toBeVisible();
    expect(screen.getByDisplayValue('model-a')).toBeVisible();
    expect(screen.getByText('密钥已安全保存在本机')).toBeVisible();
    expect(screen.getByLabelText('替换 API Key')).toHaveValue('');
    expect(screen.queryByDisplayValue(/secret|sk-/i)).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: '测试连接' }));

    expect((await screen.findAllByText('请求过于频繁，请稍后再试。'))[0]).toBeVisible();
    expect(document.body).not.toHaveTextContent('provider payload');
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
    const analysis = await screen.findByLabelText(/^共性能力分析模板/);
    await user.clear(analysis);
    await user.type(analysis, '   ');
    await user.click(screen.getByRole('button', { name: '保存共性能力分析模板' }));

    expect(screen.getByText('模板内容不能为空。')).toBeVisible();
    expect(fake.assets.prompts.save).not.toHaveBeenCalled();
  });
});
