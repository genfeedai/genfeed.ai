// @vitest-environment jsdom
'use client';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextResource } from './context-resource';

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe('useContextResource cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dedupes concurrent mounts with the same cache key', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 'shared-resource' });
    const options = {
      cacheKey: `context-resource:dedupe:${crypto.randomUUID()}`,
      cacheTimeMs: 60_000,
    };

    const first = renderHook(() => useContextResource(fetcher, options));
    const second = renderHook(() => useContextResource(fetcher, options));

    await waitFor(() => {
      expect(first.result.current.data).toEqual({ id: 'shared-resource' });
      expect(second.result.current.data).toEqual({ id: 'shared-resource' });
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('normalizes a shared promise into cached data even when the starter unmounts', async () => {
    const deferred = createDeferred<{ id: string }>();
    const fetcher = vi.fn(() => deferred.promise);
    const cacheKey = `context-resource:unmounted-starter:${crypto.randomUUID()}`;
    const first = renderHook(() =>
      useContextResource(fetcher, {
        cacheKey,
        cacheTimeMs: 60_000,
      }),
    );

    first.unmount();

    await act(async () => {
      deferred.resolve({ id: 'resolved-after-unmount' });
      await deferred.promise;
    });

    const second = renderHook(() =>
      useContextResource(fetcher, {
        cacheKey,
        cacheTimeMs: 60_000,
      }),
    );

    expect(second.result.current.data).toEqual({
      id: 'resolved-after-unmount',
    });
    expect(second.result.current.isLoading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    second.unmount();
  });

  it('bypasses cached data on explicit refresh', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ id: 'initial' })
      .mockResolvedValueOnce({ id: 'refreshed' });
    const cacheKey = `context-resource:refresh:${crypto.randomUUID()}`;
    const { result, unmount } = renderHook(() =>
      useContextResource(fetcher, {
        cacheKey,
        cacheTimeMs: 60_000,
      }),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 'initial' });
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toEqual({ id: 'refreshed' });
    expect(fetcher).toHaveBeenCalledTimes(2);

    unmount();
  });
});
