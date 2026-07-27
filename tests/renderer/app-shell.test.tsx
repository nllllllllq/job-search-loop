import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the core desktop navigation', () => {
    render(<App />);

    expect(screen.getByText('求职闭环')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '从每一次准备，到下一次更从容的表达。' }),
    ).toBeInTheDocument();

    for (const label of [
      '总览',
      '岗位',
      '复盘中心',
      '项目档案',
      '问题库',
      '随想与心得',
      '设置',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('navigates from the overview to the positions placeholder', async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('link', { name: '岗位' }));

    expect(screen.getByRole('heading', { name: '岗位' })).toBeInTheDocument();
    expect(screen.getByText('这个模块会在后续版本中逐步完善。')).toBeInTheDocument();
  });
});
