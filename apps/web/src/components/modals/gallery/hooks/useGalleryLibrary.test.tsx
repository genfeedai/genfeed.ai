import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import type {
  IIngredient,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryLibrary } from './useGalleryLibrary';

const mocks = vi.hoisted(() => {
  const findAllPage = vi.fn();
  const error = vi.fn();
  return {
    error,
    findAllPage,
    getService: async () => ({ findAllPage }),
  };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function page(
  ids: string[],
  nextCursor: string | null = null,
): IPaginatedResponse<IIngredient> {
  return {
    hasNext: nextCursor !== null,
    hasPrevious: false,
    items: ids.map((id) => ({ id }) as IIngredient),
    nextCursor,
    page: 1,
    pageSize: 30,
    total: ids.length,
    totalPages: 1,
  };
}

const props = { category: IngredientCategory.VIDEO, isOpen: true };

describe('useGalleryLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllPage.mockResolvedValue(page([]));
  });
  afterEach(cleanup);

  it("lists the brand's finished assets of one type, newest first", async () => {
    mocks.findAllPage.mockResolvedValue(page(['clip-1', 'clip-2']));
    const { result } = renderHook(() => useGalleryLibrary(props));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual([
      'clip-1',
      'clip-2',
    ]);
    expect(mocks.findAllPage.mock.calls[0]?.[0]).toEqual({
      brand: 'brand-1',
      categories: [IngredientCategory.VIDEO],
      limit: 30,
      paging: 'cursor',
      sort: 'createdAt: -1',
      status: [
        IngredientStatus.UPLOADED,
        IngredientStatus.GENERATED,
        IngredientStatus.VALIDATED,
      ],
    });
  });

  it('narrows the list by search, origin and starred', async () => {
    const { result } = renderHook(() => useGalleryLibrary(props));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onSearchChange('  founder ');
      result.current.onOriginsChange([IngredientOrigin.UPLOADED]);
      result.current.onStarredOnlyChange(true);
      result.current.onSortChange('createdAt: 1');
    });

    await waitFor(() =>
      expect(mocks.findAllPage.mock.lastCall?.[0]).toMatchObject({
        isFavorite: 'true',
        origins: [IngredientOrigin.UPLOADED],
        search: 'founder',
        sort: 'createdAt: 1',
      }),
    );
  });

  it('appends the next cursor page without repeating assets', async () => {
    mocks.findAllPage
      .mockResolvedValueOnce(page(['a', 'b'], 'cursor-2'))
      .mockResolvedValueOnce(page(['b', 'c']));
    const { result } = renderHook(() => useGalleryLibrary(props));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(mocks.findAllPage.mock.lastCall?.[0]).toMatchObject({
      cursor: 'cursor-2',
    });
    expect(result.current.items.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('starts from the whole Library when reopened', async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useGalleryLibrary({ ...props, isOpen }),
      { initialProps: { isOpen: true } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.onSearchChange('old search');
      result.current.onStarredOnlyChange(true);
    });

    rerender({ isOpen: false });

    expect(result.current.search).toBe('');
    expect(result.current.isStarredOnly).toBe(false);
  });

  it('tells the user when the Library cannot load', async () => {
    mocks.findAllPage.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useGalleryLibrary(props));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith('Failed to load the Library');
  });
});
