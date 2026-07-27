import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncResource } from '../../src/renderer/hooks/useAsyncResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('useAsyncResource', () => {
  it('loads data and exposes loading state', async () => {
    const request = deferred<string>();
    const { result } = renderHook(() => useAsyncResource(() => request.promise, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => {
      request.resolve('已加载');
      await request.promise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('已加载');
    expect(result.current.error).toBeNull();
  });

  it('reports errors and can reload', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('网络不可用'))
      .mockResolvedValueOnce('重试成功');
    const { result } = renderHook(() => useAsyncResource(loader, []));

    await waitFor(() => expect(result.current.error).toEqual(new Error('网络不可用')));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.data).toBe('重试成功');
    expect(result.current.error).toBeNull();
  });

  it('ignores an older request that finishes after a reload', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loader = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsyncResource(loader, []));

    act(() => {
      void result.current.reload();
    });

    await act(async () => {
      second.resolve('最新结果');
      await second.promise;
    });
    expect(result.current.data).toBe('最新结果');

    await act(async () => {
      first.resolve('过期结果');
      await first.promise;
    });

    expect(result.current.data).toBe('最新结果');
  });
});
