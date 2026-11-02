import { paginatedResponse } from '@app-tests/paginated-response';
import {
  AssetCategory,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { Image } from '@models/ingredients/image.model';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalGallery } from './useModalGallery';

const mocks = vi.hoisted(() => {
  const findAllPage = vi.fn();
  const error = vi.fn();
  return {
    findAllPage,
    error,
    getService: async () => ({ findAllPage }),
    notifications: { error },
  };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
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

describe('useModalGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllPage.mockResolvedValue(paginatedResponse([]));
  });
  afterEach(cleanup);

  it('preserves media filters and the page response', async () => {
    const image = new Image({ id: 'image-1' });
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([image], { totalDocs: 40, totalPages: 4 }),
    );
    const { result } = renderHook(() =>
      useModalGallery({ ...props, filterReferenceId: 'reference-1' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([image]);
    expect(result.current.totalPages).toBe(4);
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      {
        brand: 'brand-1',
        format: IngredientFormat.PORTRAIT,
        lightweight: true,
        limit: 12,
        page: 1,
        reference: 'reference-1',
        sort: 'createdAt: -1',
        status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
      },
      expect.any(AbortSignal),
    );
  });

  it('keeps independent metadata for two gallery instances', async () => {
    mocks.findAllPage
      .mockResolvedValueOnce(
        paginatedResponse([new Image({ id: 'first' })], {
          totalDocs: 40,
          totalPages: 4,
        }),
      )
      .mockResolvedValueOnce(
        paginatedResponse([new Image({ id: 'second' })], {
          totalDocs: 200,
          totalPages: 20,
        }),
      );
    const { result } = renderHook(() => {
      const first = useModalGallery(props);
      const second = useModalGallery(props);
      return { first, second };
    });
    await waitFor(() => expect(result.current.second.isLoading).toBe(false));
    expect(result.current.first.items[0]?.id).toBe('first');
    expect(result.current.first.totalPages).toBe(4);
    expect(result.current.second.items[0]?.id).toBe('second');
    expect(result.current.second.totalPages).toBe(20);
  });

  it('keeps the latest requested page when an older response finishes late', async () => {
    const older = Promise.withResolvers<IPaginatedResponse<Image>>();
    mocks.findAllPage.mockReturnValueOnce(older.promise).mockResolvedValueOnce({
      ...paginatedResponse([new Image({ id: 'latest' })], {
        totalDocs: 24,
        totalPages: 2,
      }),
      page: 2,
    });
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(1));
    const olderSignal = mocks.findAllPage.mock.calls[0]?.[1];
    await act(() => result.current.loadPage(2));
    expect(olderSignal.aborted).toBe(true);
    await act(async () =>
      older.resolve(
        paginatedResponse([new Image({ id: 'stale' })], {
          totalDocs: 500,
          totalPages: 50,
        }),
      ),
    );
    expect(result.current.items[0]?.id).toBe('latest');
    expect(result.current.currentPage).toBe(2);
    expect(result.current.totalPages).toBe(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('loads uploads and creations with their existing status and page size', async () => {
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setActiveTab('uploads'));
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 15,
          status: IngredientStatus.UPLOADED,
          brand: 'brand-1',
        }),
        expect.any(AbortSignal),
      ),
    );
    act(() => result.current.setActiveTab('creations'));
    await waitFor(() =>
      expect(mocks.findAllPage).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 15,
          status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('paginates references through the asset query without loading media', async () => {
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setActiveTab('references'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.findAllPage.mockResolvedValue({
      ...paginatedResponse([], { totalDocs: 31, totalPages: 3 }),
      page: 2,
    });
    await act(() => result.current.loadPage(2));
    expect(mocks.findAllPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: AssetCategory.REFERENCE,
        page: 2,
        parent: 'brand-1',
        parentModel: 'Brand',
        lightweight: true,
        format: IngredientFormat.PORTRAIT,
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.currentPage).toBe(2);
    expect(result.current.totalPages).toBe(3);
  });

  it('does not let a late media response change the references tab', async () => {
    const older = Promise.withResolvers<IPaginatedResponse<Image>>();
    mocks.findAllPage
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(
        paginatedResponse([], { totalDocs: 31, totalPages: 3 }),
      );
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(1));
    act(() => result.current.setActiveTab('references'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () =>
      older.resolve(
        paginatedResponse([new Image({ id: 'stale' })], {
          totalDocs: 500,
          totalPages: 50,
        }),
      ),
    );
    expect(result.current.activeTab).toBe('references');
    expect(result.current.totalPages).toBe(3);
    expect(result.current.items).toEqual([]);
  });

  it('clears state on close and ignores in-flight results', async () => {
    const pending = Promise.withResolvers<IPaginatedResponse<Image>>();
    mocks.findAllPage.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ isOpen }) => useModalGallery({ ...props, isOpen }),
      { initialProps: { isOpen: true } },
    );
    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(1));
    rerender({ isOpen: false });
    await act(async () =>
      pending.resolve(
        paginatedResponse([new Image({ id: 'stale' })], {
          totalDocs: 500,
          totalPages: 50,
        }),
      ),
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.totalPages).toBe(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('omits the format filter when the picker accepts any ratio', async () => {
    const { result } = renderHook(() =>
      useModalGallery({ ...props, isFormatFilterEnabled: false }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.findAllPage.mock.calls[0]?.[0]).not.toHaveProperty('format');
  });

  it('preserves multi-selection while changing tabs', async () => {
    const image = new Image({ id: 'selected' });
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.handleItemSelect(image));
    act(() => result.current.setActiveTab('uploads'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedItems).toEqual(['selected']);
    expect(result.current.selectedItemsData).toEqual([image]);
  });

  it('preserves video status filtering and its reference filter', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse(
        [
          { id: 'ready', status: IngredientStatus.GENERATED },
          { id: 'processing', status: IngredientStatus.PROCESSING },
          { id: 'failed', status: IngredientStatus.FAILED },
        ],
        { totalDocs: 50, totalPages: 5 },
      ),
    );
    const { result } = renderHook(() =>
      useModalGallery({
        ...props,
        category: IngredientCategory.VIDEO,
        filterReferenceId: 'reference-1',
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual(['ready']);
    expect(result.current.totalPages).toBe(5);
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 12,
        reference: 'reference-1',
        format: IngredientFormat.PORTRAIT,
      }),
      expect.any(AbortSignal),
    );
  });

  it('keeps music queries free of image limits and aspect ratios', async () => {
    const { result } = renderHook(() =>
      useModalGallery({ ...props, category: IngredientCategory.MUSIC }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
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

  it('reports a current request failure and clears its page', async () => {
    mocks.findAllPage.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useModalGallery(props));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.totalPages).toBe(1);
    expect(mocks.error).toHaveBeenCalledWith('Failed to load IMAGE');
  });
});
