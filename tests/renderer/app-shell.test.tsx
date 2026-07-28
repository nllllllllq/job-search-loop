import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

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
    expect(screen.getByRole('heading', { name: '总览' })).toBeInTheDocument();
    expect(screen.getByText('数据仅保存在本机')).toBeInTheDocument();

    for (const label of [
      '总览',
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
});
