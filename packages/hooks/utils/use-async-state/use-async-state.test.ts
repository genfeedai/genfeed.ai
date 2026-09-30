import { useAsyncState } from '@hooks/utils/use-async-state/use-async-state';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useAsyncState('seed'));

    expect(result.current.data).toBe('seed');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('respects initialLoading option', () => {
    const { result } = renderHook(() =>
      useAsyncState('seed', { initialLoading: true }),
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('executes async function and updates data', async () => {
    const asyncFunction = vi.fn().mockResolvedValue('next');
    const { result } = renderHook(() => useAsyncState('seed'));

    await act(async () => {
      await result.current.execute(asyncFunction);
    });

    expect(asyncFunction).toHaveBeenCalled();
    expect(result.current.data).toBe('next');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('supports refresh execution mode', async () => {
    let resolveFn: ((value: string) => void) | null = null;
    const asyncFunction = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncState('seed'));

    let executePromise: Promise<unknown> | null = null;

    act(() => {
      executePromise = result.current.execute(asyncFunction, {
        isRefresh: true,
      });
    });

    expect(result.current.isRefreshing).toBe(true);

    act(() => {
      resolveFn?.('refreshed');
    });

    await act(async () => {
      await executePromise;
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.data).toBe('refreshed');
  });

  it('handles errors and calls error handlers', async () => {
    const error = new Error('boom');
    const asyncFunction = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const onHookError = vi.fn();
    const { result } = renderHook(() =>
      useAsyncState('seed', { onError: onHookError }),
    );

    await act(async () => {
      await result.current.execute(asyncFunction, { onError });
    });

    expect(result.current.error).toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onHookError).toHaveBeenCalledWith(error);
    expect(result.current.isLoading).toBe(false);
  });

  it('aborts in-flight requests on reset', async () => {
    const abortSpy = vi.fn();
    const asyncFunction = vi.fn(
      (signal?: AbortSignal) =>
        new Promise<string>((resolve) => {
          if (signal) {
            signal.addEventListener('abort', () => {
              abortSpy();
              resolve('aborted');
            });
          }
        }),
    );
    const { result } = renderHook(() => useAsyncState('seed'));

    act(() => {
      result.current.execute(asyncFunction);
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    expect(result.current.data).toBe('seed');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });
  it('keeps loading true when an older cancelled request settles', async () => {
    let finishFirst!: (value: string) => void;
    let finishSecond!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      finishFirst = resolve;
    });
    const second = new Promise<string>((resolve) => {
      finishSecond = resolve;
    });
    const { result } = renderHook(() => useAsyncState('seed'));
    let firstExecution!: Promise<string | undefined>;
    let secondExecution!: Promise<string | undefined>;
    act(() => {
      firstExecution = result.current.execute(() => first);
    });
    act(() => {
      secondExecution = result.current.execute(() => second);
    });
    await act(async () => {
      finishFirst('old');
      await firstExecution;
    });
    try {
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBe('seed');
    } finally {
      await act(async () => {
        finishSecond('new');
        await secondExecution;
      });
    }
  });

  it('ignores stale rejection callbacks and reset completions', async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAsyncState('seed', { onError }));
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    let pendingFirst: Promise<string | undefined>;
    let pendingSecond: Promise<string | undefined>;
    act(() => {
      pendingFirst = result.current.execute(() => first.promise, { onError });
    });
    act(() => {
      pendingSecond = result.current.execute(() => second.promise, {
        onSuccess,
        isRefresh: true,
      });
    });
    await act(async () => {
      first.reject(new Error('old'));
      await pendingFirst;
    });
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isRefreshing).toBe(true);
    act(() => result.current.reset());
    await act(async () => {
      second.resolve('late');
      await pendingSecond;
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.data).toBe('seed');
  });
});
