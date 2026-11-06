import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  AssetCategory,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { Image } from '@models/ingredients/image.model';
import { Music } from '@models/ingredients/music.model';
import { Video } from '@models/ingredients/video.model';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalGallery } from './useModalGallery';

const mocks = vi.hoisted(() => {
  const findAllPage = vi.fn();
  const error = vi.fn();
  return {
    findAllPage,
    error,
    getService: async () => ({
      assets: { findAllPage },
      musics: { findAllPage },
    }),
    notifications: { error },
  };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const props = {
  category: IngredientCategory.IMAGE,
  format: IngredientFormat.PORTRAIT,
  isOpen: true,
};
const musicProps = { ...props, category: IngredientCategory.MUSIC };

describe('useModalGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllPage.mockResolvedValue(paginatedResponse([]));
  });
  afterEach(cleanup);

  it('leaves image and video listing to the Library grid', async () => {
    const { result } = renderHook(() => useModalGallery(props), {
      wrapper: queryClientWrapper(),
    });

    await act(async () => {});
    expect(mocks.findAllPage).not.toHaveBeenCalled();
    expect(result.current.tabs.map((tab) => tab.id)).toEqual([
      'media',
      'references',
    ]);
  });

  it('pages music tracks for the brand', async () => {
    const track = new Music({ id: 'track-1' });
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([track], { totalDocs: 40, totalPages: 4 }),
    );
    const { result } = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([track]);
    expect(result.current.totalPages).toBe(4);
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      {
        brand: 'brand-1',
        page: 1,
        sort: 'createdAt: -1',
        status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
      },
      expect.any(AbortSignal),
    );
  });

  it('keeps the latest requested page when an older response finishes late', async () => {
    const older = Promise.withResolvers<IPaginatedResponse<Music>>();
    mocks.findAllPage.mockReturnValueOnce(older.promise).mockResolvedValueOnce({
      ...paginatedResponse([new Music({ id: 'latest' })], {
        totalDocs: 24,
        totalPages: 2,
      }),
      page: 2,
    });
    const { result } = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(1));

    await act(() => result.current.loadPage(2));
    await waitFor(() => expect(result.current.currentPage).toBe(2));
    await act(async () =>
      older.resolve(
        paginatedResponse([new Music({ id: 'stale' })], {
          totalDocs: 500,
          totalPages: 50,
        }),
      ),
    );

    expect(result.current.items[0]?.id).toBe('latest');
    expect(result.current.currentPage).toBe(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('pages brand references through the asset query', async () => {
    mocks.findAllPage.mockResolvedValue({
      ...paginatedResponse([], { totalDocs: 31, totalPages: 3 }),
      page: 2,
    });
    const { result } = renderHook(() => useModalGallery(props), {
      wrapper: queryClientWrapper(),
    });

    act(() => result.current.setActiveTab('references'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadPage(2));

    await waitFor(() => expect(result.current.currentPage).toBe(2));
    expect(mocks.findAllPage).toHaveBeenLastCalledWith(
      {
        category: AssetCategory.REFERENCE,
        lightweight: true,
        page: 2,
        parent: 'brand-1',
        parentModel: 'Brand',
        sort: 'createdAt: -1',
      },
      expect.any(AbortSignal),
    );
    expect(result.current.currentPage).toBe(2);
    expect(result.current.totalPages).toBe(3);
  });

  it('clears state on close and ignores in-flight results', async () => {
    const pending = Promise.withResolvers<IPaginatedResponse<Music>>();
    mocks.findAllPage.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ isOpen }) => useModalGallery({ ...musicProps, isOpen }),
      { initialProps: { isOpen: true }, wrapper: queryClientWrapper() },
    );
    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(1));

    rerender({ isOpen: false });
    await act(async () =>
      pending.resolve(paginatedResponse([new Music({ id: 'stale' })])),
    );

    expect(result.current.items).toEqual([]);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('collects several images and drops one picked twice', () => {
    const first = new Image({ id: 'first' });
    const second = new Image({ id: 'second' });
    const { result } = renderHook(() => useModalGallery(props), {
      wrapper: queryClientWrapper(),
    });

    act(() => result.current.handleItemSelect(first));
    act(() => result.current.handleItemSelect(second));
    act(() => result.current.handleItemSelect(first));

    expect(result.current.selectedItems).toEqual(['second']);
    expect(result.current.selectedItemsData).toEqual([second]);
  });

  it('holds one video unless the caller asks for more', () => {
    const first = new Video({ id: 'first' });
    const second = new Video({ id: 'second' });
    const { result } = renderHook(
      () => useModalGallery({ ...props, category: IngredientCategory.VIDEO }),
      { wrapper: queryClientWrapper() },
    );

    act(() => result.current.handleItemSelect(first));
    act(() => result.current.handleItemSelect(second));

    expect(result.current.selectionLimit).toBe(1);
    expect(result.current.selectedItems).toEqual(['second']);
    expect(result.current.tabs).toEqual([]);
  });

  it('refuses a pick past the limit and says why', () => {
    const { result } = renderHook(
      () => useModalGallery({ ...props, maxSelectableItems: 2 }),
      { wrapper: queryClientWrapper() },
    );

    act(() => result.current.handleItemSelect(new Image({ id: 'a' })));
    act(() => result.current.handleItemSelect(new Image({ id: 'b' })));
    act(() => result.current.handleItemSelect(new Image({ id: 'c' })));

    expect(result.current.selectedItems).toEqual(['a', 'b']);
    expect(mocks.error).toHaveBeenCalledWith(
      'You can only select up to 2 items.',
    );
  });

  it('reports a failed music request and clears its page', async () => {
    mocks.findAllPage.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith('Failed to load music');
  });

  it('paints the cached music page on reopen without a loading state', async () => {
    const track = new Music({ id: 'track-1' });
    mocks.findAllPage.mockResolvedValueOnce(paginatedResponse([track]));
    const client = createTestQueryClient();
    const first = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(first.result.current.items).toEqual([track]));
    first.unmount();

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([track]);
  });

  it('keeps the current page on screen while the next one loads', async () => {
    const track = new Music({ id: 'track-1' });
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([track], { totalDocs: 40, totalPages: 4 }),
    );
    const { result } = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.items).toEqual([track]));

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    await act(() => result.current.loadPage(2));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([track]);
    expect(result.current.currentPage).toBe(2);
  });

  it('never paints the music cache on the brand references tab', async () => {
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([new Music({ id: 'track-1' })]),
    );
    const client = createTestQueryClient();
    const first = renderHook(() => useModalGallery(musicProps), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(first.result.current.items).toHaveLength(1));
    first.unmount();

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useModalGallery(props), {
      wrapper: queryClientWrapper(client),
    });
    act(() => result.current.setActiveTab('references'));

    expect(result.current.isLoadingReferences).toBe(true);
    expect(result.current.references).toEqual([]);
    expect(result.current.items).toEqual([]);
  });
});
