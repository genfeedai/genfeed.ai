import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { useStudioPlaygroundGallery } from '@pages/studio/playground/hooks/useStudioPlaygroundGallery';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAllPage: vi.fn(),
  error: vi.fn(),
  getService: vi.fn(),
  identity: { userId: 'user-a', sessionId: 'session-a', orgId: 'org-a' },
  organizationId: 'org-a',
  apiEndpoint: 'https://api.example.test',
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return mocks.apiEndpoint;
    },
  },
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => {
    const { userId, sessionId, orgId } = mocks.identity;
    // biome-ignore lint/correctness/useExhaustiveDependencies: Mirror the canonical auth getter identity contract.
    return useCallback(() => mocks.getService(), [userId, sessionId, orgId]);
  },
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {},
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.error },
}));
vi.mock('@pages/studio/playground/utils/studio-playground-asset', () => ({
  toStudioPlaygroundJob: (asset: Ingredient) => ({
    id: asset.id,
    createdAt: 1,
  }),
}));

function page(ids: string[] = [], totalPages = 1) {
  return { items: ids.map((id) => ({ id })), totalPages };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const scope = { brandId: 'brand-a', filter: 'all' as const };
const ALL_CATEGORY_COUNT = 5;

function queueCategoryPages(ids: string[]) {
  mocks.findAllPage.mockResolvedValueOnce(page(ids));
  for (let index = 1; index < ALL_CATEGORY_COUNT; index += 1)
    mocks.findAllPage.mockResolvedValueOnce(page());
}

describe('Studio history recovery with the real bounded loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllPage.mockReset();
    mocks.getService.mockReset().mockResolvedValue({
      findAllPage: mocks.findAllPage,
    });
    mocks.identity.userId = 'user-a';
    mocks.identity.sessionId = 'session-a';
    mocks.identity.orgId = 'org-a';
    mocks.organizationId = 'org-a';
    mocks.apiEndpoint = 'https://api.example.test';
  });

  it('loads a complete snapshot and supports a successful empty result', async () => {
    queueCategoryPages(['saved']);
    queueCategoryPages([]);
    const { result } = renderHook(() => useStudioPlaygroundGallery(scope));
    await waitFor(() => expect(result.current.storedJobs).toHaveLength(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.isLoadingGallery).toBe(false));
    expect(result.current.storedJobs).toEqual([]);
    expect(result.current.galleryError).toBeNull();
    expect(
      mocks.findAllPage.mock.calls.every(([query]) => query.limit === 24),
    ).toBe(true);
  });

  it('keeps load error visible during retry, then clears it only on success', async () => {
    const retry = deferred<ReturnType<typeof page>>();
    let calls = 0;
    mocks.findAllPage.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('offline'));
      if (calls === ALL_CATEGORY_COUNT + 1) return retry.promise;
      return Promise.resolve(page());
    });
    const { result } = renderHook(() => useStudioPlaygroundGallery(scope));
    await waitFor(() => expect(result.current.galleryError).toBe('load'));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
    );
    expect(result.current.galleryError).toBe('load');
    expect(result.current.isLoadingGallery).toBe(true);
    await act(async () => retry.resolve(page(['restored'])));
    await waitFor(() => expect(result.current.galleryError).toBeNull());
    expect(result.current.storedJobs.map((job) => job.id)).toEqual([
      'restored',
    ]);
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });

  it.each([{ ids: [] }, { ids: ['saved'] }])(
    'retains the last complete snapshot after repeated refresh failures: %j',
    async ({ ids }) => {
      let calls = 0;
      mocks.findAllPage.mockImplementation(() => {
        calls += 1;
        if (calls <= ALL_CATEGORY_COUNT)
          return Promise.resolve(page(calls === 1 ? ids : []));
        return Promise.reject(new Error('offline'));
      });
      const { result } = renderHook(() => useStudioPlaygroundGallery(scope));
      await waitFor(() => expect(result.current.isLoadingGallery).toBe(false));
      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.galleryError).toBe('refresh'));
      act(() => result.current.refresh());
      await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));
      expect(result.current.storedJobs.map((job) => job.id)).toEqual(ids);
      expect(result.current.galleryError).toBe('refresh');
    },
  );

  it('never publishes a partial category set and retries from the first category', async () => {
    mocks.findAllPage
      .mockResolvedValueOnce(page(['kept-out']))
      .mockRejectedValueOnce(new Error('next category'))
      .mockResolvedValue(page(['retry-result']));
    const { result } = renderHook(() => useStudioPlaygroundGallery(scope));
    await waitFor(() => expect(result.current.galleryError).toBe('load'));
    expect(result.current.storedJobs).toEqual([]);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.galleryError).toBeNull());
    expect(
      mocks.findAllPage.mock.calls.map(([query]) => query.page),
    ).not.toContain(2);
    expect(
      mocks.findAllPage.mock.calls.every(([query]) => query.limit === 24),
    ).toBe(true);
    expect(result.current.storedJobs.map((job) => job.id)).toEqual([
      'retry-result',
    ]);
  });

  it('clears brand and filter scope synchronously and never resurrects discarded A', async () => {
    let calls = 0;
    mocks.findAllPage.mockImplementation(() => {
      calls += 1;
      if (calls <= ALL_CATEGORY_COUNT)
        return Promise.resolve(page(calls === 1 ? ['a'] : []));
      return Promise.reject(new Error('unavailable'));
    });
    const { result, rerender } = renderHook(useStudioPlaygroundGallery, {
      initialProps: { brandId: 'brand-a', filter: 'all' as 'all' | 'image' },
    });
    await waitFor(() => expect(result.current.storedJobs).toHaveLength(1));
    rerender({ brandId: 'brand-a', filter: 'image' });
    expect(result.current.storedJobs).toEqual([]);
    expect(result.current.galleryError).toBeNull();
    await waitFor(() => expect(result.current.galleryError).toBe('load'));
    rerender({ brandId: 'brand-b', filter: 'all' });
    expect(result.current.galleryError).toBeNull();
    rerender({ brandId: 'brand-a', filter: 'all' });
    expect(result.current.storedJobs).toEqual([]);
    await waitFor(() => expect(result.current.galleryError).toBe('load'));
  });

  it('does not request unresolved brands', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundGallery({ ...scope, brandId: '' }),
    );
    expect(result.current).toMatchObject({
      storedJobs: [],
      galleryError: null,
      isLoadingGallery: false,
    });
    expect(mocks.findAllPage).not.toHaveBeenCalled();
  });

  it('aborts scope changes and ignores late success and failure', async () => {
    const first = deferred<ReturnType<typeof page>>();
    const second = deferred<ReturnType<typeof page>>();
    mocks.findAllPage.mockImplementation((query: { brandId: string }) => {
      if (query.brandId === 'brand-a') return first.promise;
      if (query.brandId === 'brand-b') return second.promise;
      return Promise.resolve(page(['c']));
    });
    const { result, rerender } = renderHook(useStudioPlaygroundGallery, {
      initialProps: scope,
    });
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT),
    );
    const firstSignal = mocks.findAllPage.mock.calls[0][1] as AbortSignal;
    rerender({ ...scope, brandId: 'brand-b' });
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
    );
    expect(firstSignal.aborted).toBe(true);
    rerender({ ...scope, brandId: 'brand-c' });
    await waitFor(() =>
      expect(result.current.storedJobs.map((job) => job.id)).toEqual(['c']),
    );
    await act(async () => {
      first.resolve(page(['late-a']));
      second.reject(new Error('late-b'));
    });
    expect(result.current.storedJobs.map((job) => job.id)).toEqual(['c']);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('aborts replacement and unmount without logging transport aborts', async () => {
    const first = deferred<ReturnType<typeof page>>();
    const second = deferred<ReturnType<typeof page>>();
    let calls = 0;
    mocks.findAllPage.mockImplementation(() => {
      calls += 1;
      return calls <= ALL_CATEGORY_COUNT ? first.promise : second.promise;
    });
    const { result, unmount } = renderHook(() =>
      useStudioPlaygroundGallery(scope),
    );
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT),
    );
    act(() => result.current.refresh());
    expect((mocks.findAllPage.mock.calls[0][1] as AbortSignal).aborted).toBe(
      true,
    );
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
    );
    unmount();
    expect(
      (mocks.findAllPage.mock.calls[ALL_CATEGORY_COUNT][1] as AbortSignal)
        .aborted,
    ).toBe(true);
    await act(async () => {
      first.reject(new Error('aborted'));
      second.resolve(page(['late']));
    });
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it.each([
    'actor',
    'session',
    'auth organization',
    'context organization',
    'api',
  ] as const)(
    'immediately discards prior-owner rows and error when %s changes',
    async (change) => {
      queueCategoryPages(['old-owner']);
      const { result, rerender } = renderHook(() =>
        useStudioPlaygroundGallery(scope),
      );
      await waitFor(() => expect(result.current.storedJobs).toHaveLength(1));
      mocks.findAllPage.mockRejectedValue(new Error('Refresh failed'));
      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.galleryError).toBe('refresh'));
      mocks.findAllPage.mockReturnValue(new Promise(() => {}));
      if (change === 'actor') mocks.identity.userId = 'user-b';
      else if (change === 'session') mocks.identity.sessionId = 'session-b';
      else if (change === 'auth organization') mocks.identity.orgId = 'org-b';
      else if (change === 'context organization')
        mocks.organizationId = 'org-b';
      else mocks.apiEndpoint = 'https://other-api.example.test';
      rerender();
      expect(result.current.storedJobs).toEqual([]);
      expect(result.current.galleryError).toBeNull();
      expect(result.current.isLoadingGallery).toBe(true);
      await waitFor(() =>
        expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 3),
      );
    },
  );

  it('treats replacement-owner failure as an empty load failure', async () => {
    queueCategoryPages(['old-owner']);
    const { result, rerender } = renderHook(() =>
      useStudioPlaygroundGallery(scope),
    );
    await waitFor(() => expect(result.current.storedJobs).toHaveLength(1));
    mocks.findAllPage.mockRejectedValue(new Error('New owner offline'));
    mocks.identity.userId = 'user-b';
    rerender();
    await waitFor(() => expect(result.current.galleryError).toBe('load'));
    expect(result.current.storedJobs).toEqual([]);
    expect(result.current.isLoadingGallery).toBe(false);
  });

  it.each(['success', 'failure'] as const)(
    'ignores old-owner %s after an actor scope round trip',
    async (outcome) => {
      const old = deferred<ReturnType<typeof page>>();
      mocks.findAllPage.mockReturnValue(old.promise);
      const { result, rerender } = renderHook(() =>
        useStudioPlaygroundGallery(scope),
      );
      await waitFor(() =>
        expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT),
      );
      const signal = mocks.findAllPage.mock.calls[0][1] as AbortSignal;
      mocks.findAllPage.mockResolvedValue(page(['owner-b']));
      mocks.identity.userId = 'user-b';
      rerender();
      await waitFor(() =>
        expect(result.current.storedJobs.map((job) => job.id)).toEqual([
          'owner-b',
        ]),
      );
      mocks.findAllPage.mockResolvedValue(page(['fresh-owner-a']));
      mocks.identity.userId = 'user-a';
      rerender();
      expect(result.current.storedJobs).toEqual([]);
      await waitFor(() =>
        expect(result.current.storedJobs.map((job) => job.id)).toEqual([
          'fresh-owner-a',
        ]),
      );
      expect(signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'success') old.resolve(page(['old-owner-a']));
        else old.reject(new Error('Old owner failure'));
      });
      expect(result.current.storedJobs.map((job) => job.id)).toEqual([
        'fresh-owner-a',
      ]);
      expect(result.current.galleryError).toBeNull();
      expect(result.current.isLoadingGallery).toBe(false);
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch a stale acquisition after an API scope round trip', async () => {
    const acquisition = deferred<{ findAllPage: typeof mocks.findAllPage }>();
    mocks.getService.mockReturnValueOnce(acquisition.promise);
    mocks.findAllPage.mockResolvedValue(page(['current-owner']));
    const { result, rerender } = renderHook(() =>
      useStudioPlaygroundGallery(scope),
    );
    mocks.apiEndpoint = 'https://other-api.example.test';
    rerender();
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT),
    );
    mocks.apiEndpoint = 'https://api.example.test';
    rerender();
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
    );
    await act(async () =>
      acquisition.resolve({ findAllPage: mocks.findAllPage }),
    );
    expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2);
    expect(result.current.storedJobs.map((job) => job.id)).toEqual([
      'current-owner',
    ]);
  });

  it('does not dispatch an acquisition that completes after unmount', async () => {
    const acquisition = deferred<{ findAllPage: typeof mocks.findAllPage }>();
    mocks.getService.mockReturnValueOnce(acquisition.promise);
    const { unmount } = renderHook(() => useStudioPlaygroundGallery(scope));
    unmount();
    await act(async () =>
      acquisition.resolve({ findAllPage: mocks.findAllPage }),
    );
    expect(mocks.findAllPage).not.toHaveBeenCalled();
  });

  it('ignores a captured old refresh without aborting the current owner', async () => {
    queueCategoryPages(['old-owner']);
    const { result, rerender } = renderHook(() =>
      useStudioPlaygroundGallery(scope),
    );
    await waitFor(() => expect(result.current.storedJobs).toHaveLength(1));
    const oldRefresh = result.current.refresh;
    const current = deferred<ReturnType<typeof page>>();
    mocks.findAllPage.mockReturnValue(current.promise);
    mocks.identity.userId = 'user-b';
    rerender();
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
    );
    const signal = mocks.findAllPage.mock.calls[
      ALL_CATEGORY_COUNT
    ][1] as AbortSignal;
    act(() => oldRefresh());
    expect(signal.aborted).toBe(false);
    expect(mocks.findAllPage).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2);
    await act(async () => current.resolve(page(['current-owner'])));
    await waitFor(() =>
      expect(result.current.storedJobs.map((job) => job.id)).toEqual([
        'current-owner',
      ]),
    );
    expect(result.current.galleryError).toBeNull();
  });
});
