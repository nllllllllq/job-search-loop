import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../../src/renderer/hooks/useToast';

function ToastHarness() {
  const toast = useToast();

  return (
    <>
      <button type="button" onClick={() => toast.success('保存成功')}>
        成功通知
      </button>
      <button type="button" onClick={() => toast.error('保存失败')}>
        错误通知
      </button>
    </>
  );
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces feedback in a live region and supports manual removal', () => {
    render(
      <ToastProvider defaultDuration={5_000}>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '成功通知' }));

    const region = screen.getByRole('region', { name: '通知' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('保存成功')).toHaveAttribute('data-toast-id', 'toast-1');

    fireEvent.click(
      screen.getByRole('button', { name: '关闭通知：保存成功' }),
    );
    expect(screen.queryByText('保存成功')).not.toBeInTheDocument();
  });

  it('gives simultaneous feedback unique close controls and independent timers', () => {
    vi.useFakeTimers();
    const view = render(
      <StrictMode>
        <ToastProvider defaultDuration={5_000}>
          <ToastHarness />
        </ToastProvider>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: '成功通知' }));
    fireEvent.click(screen.getByRole('button', { name: '错误通知' }));

    expect(
      screen.getByRole('button', { name: '关闭通知：保存成功' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '关闭通知：保存失败' }),
    ).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(2);

    fireEvent.click(
      screen.getByRole('button', { name: '关闭通知：保存成功' }),
    );
    expect(screen.queryByText('保存成功')).not.toBeInTheDocument();
    expect(screen.getByText('保存失败')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('automatically dismisses feedback and clears pending timers on unmount', () => {
    vi.useFakeTimers();
    const view = render(
      <ToastProvider defaultDuration={1_000}>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '错误通知' }));
    expect(screen.getByText('保存失败')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText('保存失败')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '成功通知' }));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
