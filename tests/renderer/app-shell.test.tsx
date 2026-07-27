import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

describe('App', () => {
  it('shows the core desktop navigation', () => {
    render(<App />);

    expect(screen.getByText('求职闭环')).toBeInTheDocument();

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
});
