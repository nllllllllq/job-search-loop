import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { createJobSearchFake, installJobSearchFake } from '../helpers/bridge';

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('presents the complete local-first desktop workspace', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: '求职闭环首页' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByText('数据仅保存在本机')).toBeInTheDocument();

    for (const label of [
      '首页',
      '岗位',
      '项目档案',
      '问题库',
      '随想与心得',
      '设置',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('navigation')[0].querySelectorAll('a')).toHaveLength(6);
    expect(screen.queryByRole('link', { name: '复盘中心' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '能力主题' })).not.toBeInTheDocument();
  });

  it('provides a keyboard skip link to the page content', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens a relation-free quick insight editor from the shell', async () => {
    const fake = createJobSearchFake();
    const insight = {
      id: '66666666-6666-4666-8666-666666666666',
      title: '先写结论',
      content: '\n先写结论\n再补证据',
      positionId: null,
      projectId: null,
      questionId: null,
      capabilityId: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    fake.assets.insights.save.mockResolvedValue(insight);
    installJobSearchFake(fake);
    const user = userEvent.setup();
    render(<App />);

    const launcher = screen.getByRole('button', { name: '快速记录心得' });
    launcher.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: '快速记录心得' });
    const content = within(dialog).getByRole('textbox', { name: /正文/ });
    await user.type(content, '\n先写结论\n再补证据');
    await user.click(within(dialog).getByRole('button', { name: '保存心得' }));

    await waitFor(() => expect(fake.assets.insights.save).toHaveBeenCalledWith({
      title: '先写结论',
      content: '先写结论\n再补证据',
      positionId: null,
      projectId: null,
      questionId: null,
      capabilityId: null,
    }));
  });
});
