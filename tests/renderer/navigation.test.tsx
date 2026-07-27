import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

describe('desktop navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  afterEach(() => {
    window.location.hash = '';
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
});
