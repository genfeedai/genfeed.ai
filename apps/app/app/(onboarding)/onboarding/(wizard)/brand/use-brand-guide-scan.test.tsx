// @vitest-environment jsdom

import type {
  IBrandOnboardingScan,
  IBrandOnboardingScanRequest,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrandGuideScan } from './use-brand-guide-scan';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getBrandOsScan: vi.fn(),
  startBrandOsScan: vi.fn(),
  scrape: vi.fn(),
  queueStarterAssets: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
interface HookProps {
  brandId: string;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function marker(
  overrides: Partial<IBrandOnboardingScan> = {},
): IBrandOnboardingScan {
  return {
    id: 'request-1',
    brandId: 'brand-1',
    status: 'running',
    url: 'https://saved.example',
    startedAt: new Date(Date.now()).toISOString(),
    ...overrides,
  };
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000001',
  );
  mocks.getService.mockResolvedValue(mocks);
  mocks.getBrandOsScan.mockResolvedValue(null);
  mocks.startBrandOsScan.mockResolvedValue(
    marker({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'ready',
      revisionId: 'revision-1',
    }),
  );
});
afterEach(() => {
  expect(mocks.scrape).not.toHaveBeenCalled();
  expect(mocks.queueStarterAssets).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('durable guide scan observation', () => {
  it('resolves true null with reads only and rejects a start before initial GET settles', async () => {
    const initial = deferred<IBrandOnboardingScan | null>();
    mocks.getBrandOsScan.mockReturnValue(initial.promise);
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await act(async () => {
      await result.current.start('example.com');
    });
    expect(mocks.startBrandOsScan).not.toHaveBeenCalled();
    await act(async () => {
      initial.resolve(null);
    });
    expect(result.current.scan).toBeNull();
    expect(result.current.phase).toBe('idle');
    expect(mocks.getBrandOsScan).toHaveBeenCalledExactlyOnceWith(
      'brand-1',
      expect.any(AbortSignal),
    );
  });
  it.each(['ready', 'partial', 'failed'] as const)(
    'resumes terminal %s without starting or inventing a revision',
    async (status) => {
      mocks.getBrandOsScan.mockResolvedValue(
        marker({
          status,
          revisionId: status === 'failed' ? undefined : 'saved-revision',
        }),
      );
      const { result } = renderHook(() =>
        useBrandGuideScan({ brandId: 'brand-1' }),
      );
      await settle();
      expect(result.current.scan?.status).toBe(status);
      expect(result.current.refreshKey).toBe(status === 'failed' ? 0 : 1);
      await act(async () => {
        await result.current.reconcile();
      });
      expect(result.current.refreshKey).toBe(status === 'failed' ? 0 : 1);
      expect(mocks.startBrandOsScan).not.toHaveBeenCalled();
    },
  );
  it('resumes active history, uses server startedAt for slow, and never fabricates a browser timeout', async () => {
    mocks.getBrandOsScan.mockResolvedValue(
      marker({ startedAt: new Date(Date.now() - 5000).toISOString() }),
    );
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    expect(result.current.slow).toBe(false);
    await tick(1000);
    expect(result.current.slow).toBe(true);
    await tick(60000);
    expect(result.current.scan?.status).toBe('running');
    expect(result.current.scan?.errorCode).toBeUndefined();
  });
  it('polls after GET completion without overlapping and preserves local identity through pending null', async () => {
    const post = deferred<IBrandOnboardingScan>();
    const read = deferred<IBrandOnboardingScan | null>();
    mocks.startBrandOsScan.mockReturnValue(post.promise);
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.start('  example.com/path  ');
    });
    await settle();
    const request: IBrandOnboardingScanRequest = {
      url: 'example.com/path',
      requestId: '00000000-0000-4000-8000-000000000001',
    };
    expect(mocks.startBrandOsScan).toHaveBeenCalledWith(
      'brand-1',
      request,
      expect.any(AbortSignal),
    );
    mocks.getBrandOsScan.mockReturnValueOnce(read.promise);
    await tick(2000);
    await tick(4000);
    expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(2);
    expect(result.current.slow).toBe(true);
    await act(async () => {
      read.resolve(null);
    });
    expect(result.current.request).toEqual(request);
    await tick(1999);
    expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(3);
    await act(async () => {
      post.resolve(
        marker({
          id: request.requestId,
          status: 'ready',
          revisionId: 'revision',
        }),
      );
      await operation;
    });
    expect(result.current.refreshKey).toBe(1);
    expect(result.current.request).toBeNull();
  });
  it('uses a synchronous guard against duplicate explicit starts', async () => {
    const post = deferred<IBrandOnboardingScan>();
    mocks.startBrandOsScan.mockReturnValue(post.promise);
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    act(() => {
      void result.current.start('first');
      void result.current.start('second');
    });
    await settle();
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.startBrandOsScan).toHaveBeenCalledTimes(1);
  });
  it.each([new Error('network'), { response: { status: 409 } }])(
    'reconciles uncertain POST before recovery and retries the exact request after null: %#',
    async (failure) => {
      mocks.startBrandOsScan.mockRejectedValueOnce(failure);
      const { result } = renderHook(() =>
        useBrandGuideScan({ brandId: 'brand-1' }),
      );
      await settle();
      await act(async () => {
        await result.current.start(' first.example ');
      });
      expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(2);
      expect(result.current.request?.url).toBe('first.example');
      await act(async () => {
        await result.current.start('changed.example');
      });
      expect(mocks.startBrandOsScan.mock.calls[1][1]).toEqual(
        mocks.startBrandOsScan.mock.calls[0][1],
      );
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    },
  );
  it('clears definitively rejected validation only after successful null reconciliation', async () => {
    mocks.startBrandOsScan.mockRejectedValueOnce({ response: { status: 400 } });
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    await act(async () => {
      await result.current.start('invalid');
    });
    expect(result.current.request).toBeNull();
    vi.mocked(crypto.randomUUID).mockReturnValue(
      '00000000-0000-4000-8000-000000000002',
    );
    await act(async () => {
      await result.current.start('corrected.example');
    });
    expect(mocks.startBrandOsScan.mock.calls[1][1]).toEqual({
      url: 'corrected.example',
      requestId: '00000000-0000-4000-8000-000000000002',
    });
  });
  it('stops polling on GET failure and retries GET only before permitting a retained POST', async () => {
    mocks.startBrandOsScan.mockRejectedValueOnce(new Error('network'));
    mocks.getBrandOsScan
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    await act(async () => {
      await result.current.start('example');
    });
    expect(result.current.phase).toBe('reconcile-error');
    await tick(10000);
    expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.start('ignored');
    });
    expect(mocks.startBrandOsScan).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reconcile();
    });
    expect(result.current.phase).toBe('idle');
    expect(mocks.startBrandOsScan).toHaveBeenCalledTimes(1);
    expect(result.current.request?.url).toBe('example');
  });
  it('adopts a different authoritative marker and ignores its superseded POST', async () => {
    const post = deferred<IBrandOnboardingScan>();
    mocks.startBrandOsScan.mockReturnValue(post.promise);
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.start('example');
    });
    await settle();
    mocks.getBrandOsScan.mockResolvedValue(
      marker({
        id: 'elsewhere',
        status: 'partial',
        revisionId: 'other-revision',
      }),
    );
    await tick(2000);
    await act(async () => {
      post.resolve(
        marker({
          id: '00000000-0000-4000-8000-000000000001',
          status: 'ready',
          revisionId: 'obsolete',
        }),
      );
      await operation;
    });
    expect(result.current.scan?.id).toBe('elsewhere');
    expect(result.current.refreshKey).toBe(1);
  });
  it('does not regress terminal state after late pending/running responses for the same identity', async () => {
    const post = deferred<IBrandOnboardingScan>();
    mocks.startBrandOsScan.mockReturnValue(post.promise);
    const { result } = renderHook(() =>
      useBrandGuideScan({ brandId: 'brand-1' }),
    );
    await settle();
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.start('example');
    });
    await settle();
    const id = '00000000-0000-4000-8000-000000000001';
    mocks.getBrandOsScan.mockResolvedValue(
      marker({ id, status: 'ready', revisionId: 'persisted' }),
    );
    await tick(2000);
    await act(async () => {
      post.resolve(marker({ id, status: 'pending' }));
      await operation;
    });
    expect(result.current.scan?.status).toBe('ready');
    expect(result.current.request).toBeNull();
    expect(result.current.refreshKey).toBe(1);
  });
  it('aborts old requests and fences late responses on brand change and unmount', async () => {
    const old = deferred<IBrandOnboardingScan | null>();
    mocks.getBrandOsScan.mockReturnValueOnce(old.promise);
    const view = renderHook(
      ({ brandId }: HookProps) => useBrandGuideScan({ brandId }),
      { initialProps: { brandId: 'brand-1' } },
    );
    await settle();
    const oldSignal = mocks.getBrandOsScan.mock.calls[0][1] as AbortSignal;
    view.rerender({ brandId: 'brand-2' });
    await settle();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      old.resolve(marker({ status: 'ready', revisionId: 'old' }));
    });
    expect(view.result.current.scan).toBeNull();
    const post = deferred<IBrandOnboardingScan>();
    mocks.startBrandOsScan.mockReturnValue(post.promise);
    act(() => {
      void view.result.current.start('new');
    });
    await settle();
    const postSignal = mocks.startBrandOsScan.mock.calls[0][2] as AbortSignal;
    view.unmount();
    expect(postSignal.aborted).toBe(true);
    await act(async () => {
      post.resolve(marker({ brandId: 'brand-2' }));
    });
  });
});
