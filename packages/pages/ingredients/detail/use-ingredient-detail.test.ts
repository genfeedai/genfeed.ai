import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIngredientDetail } from './use-ingredient-detail';

const mocks = vi.hoisted(() => {
  const service = { findAll: vi.fn(), findOne: vi.fn() };
  return {
    caches: new Map<string, Map<string, unknown>>(),
    clipboard: { copyToClipboard: vi.fn() },
    getService: vi.fn(() => Promise.resolve(service)),
    getVideosService: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn() },
    notifications: { error: vi.fn(), success: vi.fn() },
    router: { push: vi.fn() },
    service,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', credentials: [] }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock(
  '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services',
  () => ({
    useIngredientServices: () => ({ getVideosService: mocks.getVideosService }),
  }),
);
vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    default: () => ({ handlers: {}, loadingStates: {} }),
  }),
);
vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useIngredientOverlay: () => ({ openIngredientOverlay: vi.fn() }),
  usePostModal: () => ({ openPostBatchModal: vi.fn() }),
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));
vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => mocks.clipboard },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));
vi.mock('@services/core/logger.service', () => ({ logger: mocks.logger }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/library/images/image-1',
  useRouter: () => mocks.router,
}));
vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: (...parts: string[]) => parts.join(':'),
  createLocalStorageCache: ({ prefix }: { prefix: string }) => {
    const values = mocks.caches.get(prefix) ?? new Map<string, unknown>();
    mocks.caches.set(prefix, values);
    return {
      get: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, value),
    };
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderDetail(id = 'image-1') {
  return renderHook(
    ({ currentId }) => useIngredientDetail({ type: 'images', id: currentId }),
    { initialProps: { currentId: id } },
  );
}

describe('useIngredientDetail loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.caches.clear();
    mocks.service.findOne.mockReset().mockResolvedValue({ id: 'image-1' });
    mocks.service.findAll.mockReset().mockResolvedValue([{ id: 'child-1' }]);
  });

  it('loads the ingredient and children and caches the result', async () => {
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ingredient?.id).toBe('image-1');
    expect(result.current.childIngredients).toEqual([{ id: 'child-1' }]);
    expect(
      mocks.caches.get('ingredients:detail:')?.get('ingredient:images:image-1'),
    ).toEqual({ id: 'image-1' });
  });

  it('refreshes the parent and children and replaces cached data', async () => {
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.service.findOne.mockResolvedValue({
      id: 'image-1',
      label: 'Updated',
    });
    mocks.service.findAll.mockResolvedValue([{ id: 'child-2' }]);
    await act(async () => {
      await result.current.findIngredient();
    });
    expect(result.current.ingredient?.label).toBe('Updated');
    expect(result.current.childIngredients).toEqual([{ id: 'child-2' }]);
    expect(result.current.isUsingCache).toBe(false);
    expect(
      mocks.caches.get('ingredients:detail:')?.get('ingredient:images:image-1'),
    ).toMatchObject({ label: 'Updated' });
  });

  it('uses cached data when the request fails', async () => {
    mocks.caches.set(
      'ingredients:detail:',
      new Map([['ingredient:images:image-1', { id: 'cached-image' }]]),
    );
    mocks.caches.set(
      'ingredients:detail:meta:',
      new Map([['ingredient:images:image-1', '2026-01-01T00:00:00Z']]),
    );
    mocks.service.findOne.mockRejectedValue(new Error('offline'));
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ingredient?.id).toBe('cached-image');
    expect(result.current.isUsingCache).toBe(true);
    expect(result.current.cachedLabel).not.toBe('');
    expect(mocks.notifications.error).not.toHaveBeenCalled();
  });

  it('reports an uncached failure and navigates back to the collection', async () => {
    mocks.service.findOne.mockRejectedValue(new Error('offline'));
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.notifications.error).toHaveBeenCalledWith(
      'Failed to load ingredient',
    );
    expect(mocks.router.push).toHaveBeenCalledWith('/ingredients/images');
  });

  it('keeps the parent when optional children fail', async () => {
    mocks.service.findAll.mockRejectedValue(new Error('children unavailable'));
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ingredient?.id).toBe('image-1');
    expect(mocks.notifications.error).not.toHaveBeenCalled();
  });

  it('ignores an old parent response after the selected ID changes', async () => {
    const old = deferred<{ id: string }>();
    mocks.service.findOne
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ id: 'image-2' });
    const { result, rerender } = renderDetail();
    await waitFor(() =>
      expect(mocks.service.findOne).toHaveBeenCalledWith('image-1'),
    );
    rerender({ currentId: 'image-2' });
    await waitFor(() => expect(result.current.ingredient?.id).toBe('image-2'));
    await act(async () => {
      old.resolve({ id: 'image-1' });
    });
    expect(result.current.ingredient?.id).toBe('image-2');
    expect(mocks.service.findAll).toHaveBeenCalledTimes(1);
  });

  it('ignores an old child response after the selected ID changes', async () => {
    const old = deferred<{ id: string }[]>();
    mocks.service.findAll
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([{ id: 'new-child' }]);
    const { result, rerender } = renderDetail();
    await waitFor(() => expect(mocks.service.findAll).toHaveBeenCalledTimes(1));
    mocks.service.findOne.mockResolvedValue({ id: 'image-2' });
    rerender({ currentId: 'image-2' });
    await waitFor(() =>
      expect(result.current.childIngredients).toEqual([{ id: 'new-child' }]),
    );
    await act(async () => {
      old.resolve([{ id: 'old-child' }]);
    });
    expect(result.current.childIngredients).toEqual([{ id: 'new-child' }]);
  });
});
