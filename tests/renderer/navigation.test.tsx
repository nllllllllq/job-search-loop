import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

describe('desktop navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    document.title = '测试宿主';
  });

  afterEach(() => {
    window.location.hash = '';
    document.title = '';
  });

  it('moves between routes and marks the current page', async () => {
    const user = userEvent.setup();
    render(<App />);

    const positionsLink = screen.getByRole('link', { name: '岗位' });
    await user.click(positionsLink);

    expect(screen.getByRole('heading', { name: '岗位' })).toBeInTheDocument();
    expect(positionsLink).toHaveAttribute('aria-current', 'page');

    const settingsLink = screen.getByRole('link', { name: '设置' });
    await user.click(settingsLink);

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute('aria-current', 'page');
    expect(positionsLink).not.toHaveAttribute('aria-current');
  });

  it('offers a way home from an unknown route', () => {
    window.location.hash = '#/missing';
    render(<App />);

    expect(screen.getByRole('heading', { name: '没有找到这个页面' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回总览' })).toHaveAttribute('href', '#/');
  });

  it.each(['#/positions/', '#/POSITIONS'])(
    'keeps the shell title aligned with the matched route at %s',
    (hash) => {
      window.location.hash = hash;
      render(<App />);

      expect(
        screen.getByRole('heading', { level: 1, name: '岗位' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: '还没有岗位记录' }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    ['总览', '总览'],
    ['岗位', '岗位'],
    ['复盘中心', '复盘'],
    ['项目档案', '项目'],
    ['问题库', '题库'],
    ['随想与心得', '随想'],
    ['设置', '设置'],
  ])('keeps a compact visible label for %s', (label, shortLabel) => {
    render(<App />);

    expect(
      within(screen.getByRole('link', { name: label })).getByText(
        shortLabel,
        { selector: '.navigation-short-label' },
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['#/', '求职闭环'],
    ['#/positions', '岗位 · 求职闭环'],
    ['#/missing', '未找到页面 · 求职闭环'],
  ])('sets the document title for %s', (hash, expectedTitle) => {
    window.location.hash = hash;
    render(<App />);

    expect(document.title).toBe(expectedTitle);
  });

  it('restores the host document title on unmount', () => {
    const view = render(<App />);
    expect(document.title).toBe('求职闭环');

    view.unmount();

    expect(document.title).toBe('测试宿主');
  });
});
