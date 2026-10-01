import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findAllPage: vi.fn(), error: vi.fn() }));
const getService = async () => ({ findAllPage: mocks.findAllPage });
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {},
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.error },
}));
vi.mock('@pages/studio/generate/utils/studio-generate-asset', () => ({
  toStudioGenerateJob: (asset: Ingredient) => ({ id: asset.id, createdAt: 1 }),
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
  });

  it('loads a complete snapshot and supports a successful empty result', async () => {
    queueCategoryPages(['saved']);
    queueCategoryPages([]);
    const { result } = renderHook(() => useStudioGenerateGallery(scope));
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
    const { result } = renderHook(() => useStudioGenerateGallery(scope));
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
      const { result } = renderHook(() => useStudioGenerateGallery(scope));
      await waitFor(() => expect(result.current.isLoadingGallery).toBe(false));
      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.galleryError).toBe('refresh'));
      act(() => result.current.refresh());
      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledTimes(ALL_CATEGORY_COUNT * 2),
      );
      expect(result.current.storedJobs.map((job) => job.id)).toEqual(ids);
      expect(result.current.galleryError).toBe('refresh');
    },
  );

  it('never publishes a partial category set and retries from the first category', async () => {
    mocks.findAllPage
      .mockResolvedValueOnce(page(['kept-out']))
      .mockRejectedValueOnce(new Error('next category'))
      .mockResolvedValue(page(['retry-result']));
    const { result } = renderHook(() => useStudioGenerateGallery(scope));
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
    const { result, rerender } = renderHook(useStudioGenerateGallery, {
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
      useStudioGenerateGallery({ ...scope, brandId: '' }),
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
    const { result, rerender } = renderHook(useStudioGenerateGallery, {
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
      useStudioGenerateGallery(scope),
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
});
