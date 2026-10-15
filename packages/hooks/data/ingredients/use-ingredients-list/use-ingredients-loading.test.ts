import {
  IngredientCategory,
  LibraryShelf,
  PageScope,
} from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useIngredientsLoading } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-loading';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const mockGetIngredientsService = vi.fn();
const mockGetFoldersService = vi.fn();
const mockGetOrganizationsService = vi.fn();
const { mockLoggerError, mockNotificationError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockNotificationError: vi.fn(),
}));

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: vi.fn((...args: string[]) => args.join(':')),
  createLocalStorageCache: vi.fn(() => ({
    get: vi.fn(() => null),
    set: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((fn: (token: string) => unknown) => {
    const service = fn('test-token') as {
      serviceKind?: 'folders' | 'ingredients' | 'organizations';
    };
    if (service.serviceKind === 'organizations') {
      return mockGetOrganizationsService;
    }
    if (service.serviceKind === 'ingredients') {
      return mockGetIngredientsService;
    }
    return mockGetFoldersService;
  }),
}));

vi.mock('@genfeedai/services/content/folders.service', () => ({
  FoldersService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
      serviceKind: 'folders',
    })),
  },
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
      serviceKind: 'ingredients',
    })),
  },
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => ({
      findOrganizationIngredients: vi.fn().mockResolvedValue([]),
      serviceKind: 'organizations',
    })),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => {
  const service = {
    error: mockNotificationError,
    success: vi.fn(),
  };

  return {
    NotificationsService: {
      getInstance: vi.fn(() => service),
    },
  };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
  },
}));

/** Wraps a rows-only mock as the paged read the Library now issues. */
function pageOf(
  rows: (query: unknown, signal?: AbortSignal) => Promise<IIngredient[]>,
  links: { hasNext?: boolean; nextCursor?: string | null; page?: number } = {},
) {
  return vi.fn(async (query: unknown, signal?: AbortSignal) => {
    const items = await rows(query, signal);
    return {
      hasNext: links.hasNext ?? false,
      hasPrevious: false,
      items,
      nextCursor: links.nextCursor,
      page: links.page ?? 1,
      pageSize: 30,
      total: items.length,
      totalPages: 1,
    };
  });
}

describe('useIngredientsLoading', () => {
  let ingredientsFindAllMock: Mock<
    (query: unknown, signal?: AbortSignal) => Promise<IIngredient[]>
  >;
  const mockForm = {
    getValues: vi.fn(() => ({})),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(),
  };

  const baseProps = {
    brandId: 'brand-1',
    currentPage: 1,
    form: mockForm as never,
    formatFilter: undefined,
    loadFolders: true,
    onRefresh: vi.fn(),
    organizationId: 'org-1',
    parsedSearchParams: new URLSearchParams(),
    query: { category: '', format: '', search: '' },
    scope: PageScope.BRAND,
    setIsRefreshing: vi.fn(),
    singularType: IngredientCategory.VIDEO,
    type: 'videos',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ingredientsFindAllMock = vi
      .fn<(query: unknown, signal?: AbortSignal) => Promise<IIngredient[]>>()
      .mockResolvedValue([]);
    mockGetIngredientsService.mockResolvedValue({
      findAll: ingredientsFindAllMock,
      findAllPage: pageOf((query, signal) =>
        ingredientsFindAllMock(query, signal),
      ),
    });
    mockGetFoldersService.mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
    });
    mockGetOrganizationsService.mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
    });
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));

    expect(result.current).toHaveProperty('ingredients');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('loadError');
    expect(result.current).toHaveProperty('folders');
    expect(result.current).toHaveProperty('findAllIngredientsByCategory');
    expect(result.current).toHaveProperty('findAllFolders');
    expect(result.current).toHaveProperty('setIngredients');
    expect(result.current).toHaveProperty('notificationsService');
    expect(result.current).toHaveProperty('selectedFolderId');
  });

  it('initializes with empty ingredients and folders', () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    expect(result.current.ingredients).toEqual([]);
    expect(result.current.folders).toEqual([]);
  });

  it('initializes isLoading state', () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('findAllIngredientsByCategory and findAllFolders are functions', () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    expect(typeof result.current.findAllIngredientsByCategory).toBe('function');
    expect(typeof result.current.findAllFolders).toBe('function');
  });

  it('adds lightweight=true for media list fetches', async () => {
    renderHook(() => useIngredientsLoading(baseProps));

    await waitFor(() => {
      expect(ingredientsFindAllMock).toHaveBeenCalled();
    });

    const firstCallParams = ingredientsFindAllMock.mock.calls[0]?.[0] as {
      lightweight?: boolean;
    };
    expect(firstCallParams.lightweight).toBe(true);
  });

  it('loads every filtered Failed shelf page while preserving its brand and search', async () => {
    const findAllPages = vi
      .fn()
      .mockResolvedValue([{ id: 'last-page-failure' }]);
    mockGetIngredientsService.mockResolvedValue({
      findAll: ingredientsFindAllMock,
      findAllPages,
    });
    const { result } = renderHook(() =>
      useIngredientsLoading({
        ...baseProps,
        query: {
          shelf: LibraryShelf.FAILED,
          search: 'coffee',
          folder: 'folder-1',
        },
      }),
    );

    await waitFor(() => expect(result.current.ingredients).toHaveLength(1));
    expect(findAllPages).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        shelf: LibraryShelf.FAILED,
        search: 'coffee',
        folder: 'folder-1',
      }),
      expect.any(AbortSignal),
    );
    expect(ingredientsFindAllMock).not.toHaveBeenCalled();
  });

  it('keeps the organization-wide ingredients route unfiltered by category', async () => {
    const findOrganizationIngredients = vi.fn().mockResolvedValue([]);
    mockGetOrganizationsService.mockResolvedValue({
      findOrganizationIngredients,
    });

    renderHook(() =>
      useIngredientsLoading({
        ...baseProps,
        query: {},
        scope: PageScope.ORGANIZATION,
        singularType: IngredientCategory.INGREDIENT,
        type: 'ingredients',
      }),
    );

    await waitFor(() => {
      expect(findOrganizationIngredients).toHaveBeenCalled();
    });

    expect(findOrganizationIngredients).toHaveBeenCalledWith(
      'org-1',
      expect.not.objectContaining({
        category: IngredientCategory.INGREDIENT,
      }),
      expect.any(AbortSignal),
    );
  });

  it('strips empty query params before requesting ingredients', async () => {
    mockForm.getValues.mockReturnValue({
      brand: '',
      favorite: '',
      model: '',
      provider: '',
      search: '',
      sort: '',
      type: '',
    });

    renderHook(() =>
      useIngredientsLoading({
        ...baseProps,
        query: {
          brand: '',
          favorite: '',
          format: 'landscape',
          provider: '',
          search: '',
          sort: '',
          status: ['generated', 'processing', 'validated'],
          type: '',
        },
      }),
    );

    await waitFor(() => {
      expect(ingredientsFindAllMock).toHaveBeenCalled();
    });

    const firstCallParams = ingredientsFindAllMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(firstCallParams).toMatchObject({
      brand: 'brand-1',
      format: 'landscape',
      lightweight: true,
      page: 1,
      status: ['generated', 'processing', 'validated'],
    });
    expect(firstCallParams).not.toHaveProperty('favorite');
    expect(firstCallParams).not.toHaveProperty('model');
    expect(firstCallParams).not.toHaveProperty('provider');
    expect(firstCallParams).not.toHaveProperty('search');
    expect(firstCallParams).not.toHaveProperty('sort');
    expect(firstCallParams).not.toHaveProperty('type');
  });

  it('exposes a recoverable error when the query fails without cached assets', async () => {
    ingredientsFindAllMock.mockRejectedValue(new Error('network unavailable'));

    const { result } = renderHook(() => useIngredientsLoading(baseProps));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ingredients).toEqual([]);
    expect(result.current.loadError).toBe('Failed to load videos');
    expect(mockNotificationError).toHaveBeenCalledWith('Failed to load videos');
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('normalizes a rejected JSON:API object payload on the unsorted shelf', async () => {
    ingredientsFindAllMock.mockRejectedValue({
      errors: [
        {
          code: '500',
          detail: 'Failed for user@example.com with token secret-token',
          meta: { email: 'user@example.com', token: 'secret-token' },
          title: 'Ingredient query failed',
        },
      ],
      request: { body: { password: 'super-secret' } },
    });

    const { result } = renderHook(() =>
      useIngredientsLoading({
        ...baseProps,
        query: { shelf: 'unsorted' },
        singularType: IngredientCategory.INGREDIENT,
        type: 'ingredients',
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.loadError).toBe('Failed to load ingredients');
    expect(mockNotificationError).toHaveBeenCalledWith(
      'Failed to load ingredients',
    );

    const ingredientsLog = mockLoggerError.mock.calls.find(
      (call) => call[0] === 'GET /ingredients failed',
    );
    expect(ingredientsLog).toEqual([
      'GET /ingredients failed',
      expect.objectContaining({
        error: expect.objectContaining({
          category: 'Ingredient query failed',
          message: 'Ingredient query failed',
          name: 'ServiceOperationError',
        }),
        reportToSentry: true,
        tags: expect.objectContaining({
          error_category: 'Ingredient query failed',
          operation: 'GET /ingredients',
          surface: 'library',
        }),
      }),
    ]);

    expect(JSON.stringify(ingredientsLog?.[1])).not.toContain(
      'user@example.com',
    );
    expect(JSON.stringify(ingredientsLog?.[1])).not.toContain('secret-token');
    expect(JSON.stringify(ingredientsLog?.[1])).not.toContain('super-secret');
  });

  it('reports a generic service failure as one normalized Error', async () => {
    ingredientsFindAllMock.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useIngredientsLoading({
        ...baseProps,
        query: { shelf: 'unsorted' },
        singularType: IngredientCategory.INGREDIENT,
        type: 'ingredients',
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const ingredientsLogs = mockLoggerError.mock.calls.filter(
      (call) => call[0] === 'GET /ingredients failed',
    );
    expect(ingredientsLogs.length).toBeGreaterThan(0);
    for (const call of ingredientsLogs) {
      expect(call?.[1]).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Network error',
            name: 'ServiceOperationError',
          }),
          reportToSentry: true,
          tags: expect.objectContaining({
            error_category: 'service_operation',
            operation: 'GET /ingredients',
            surface: 'library',
          }),
        }),
      );
    }
  });
  it('ignores an older refresh that resolves after the latest review refresh', async () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let resolveOld: ((assets: IIngredient[]) => void) | undefined;
    ingredientsFindAllMock.mockImplementationOnce(
      () =>
        new Promise<IIngredient[]>((resolve) => {
          resolveOld = resolve;
        }),
    );
    ingredientsFindAllMock.mockResolvedValueOnce([]);
    act(() => window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT)));
    await waitFor(() => expect(resolveOld).toBeDefined());
    act(() => window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT)));
    await waitFor(() =>
      expect(baseProps.setIsRefreshing).toHaveBeenLastCalledWith(false),
    );
    await act(async () =>
      resolveOld?.([{ id: 'rejected-asset' } as IIngredient]),
    );
    expect(result.current.ingredients).toEqual([]);
  });

  it('skips a second list fetch when the sender already reloaded the list', async () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterLoad = ingredientsFindAllMock.mock.calls.length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent(LIBRARY_ASSETS_REFRESH_EVENT, {
          detail: { isListRefresh: false },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(ingredientsFindAllMock).toHaveBeenCalledTimes(callsAfterLoad);

    act(() => {
      window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
    });
    await waitFor(() => {
      expect(ingredientsFindAllMock.mock.calls.length).toBeGreaterThan(
        callsAfterLoad,
      );
    });
  });

  it('preserves visible review decisions when a refresh fails', async () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const approved = { id: 'approved', status: 'VALIDATED' } as IIngredient;
    act(() => result.current.setIngredients([approved]));
    ingredientsFindAllMock.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => result.current.findAllIngredientsByCategory(true));
    expect(result.current.ingredients).toEqual([approved]);
    expect(mockNotificationError).toHaveBeenCalledWith(
      'Failed to refresh videos',
    );
  });

  it('sends exactly one list request on mount', async () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await Promise.resolve();
    });

    expect(ingredientsFindAllMock).toHaveBeenCalledTimes(1);
  });

  it('sends exactly one list request per filter change', async () => {
    const { result, rerender } = renderHook(
      (props: typeof baseProps) => useIngredientsLoading(props),
      { initialProps: baseProps },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterMount = ingredientsFindAllMock.mock.calls.length;

    rerender({ ...baseProps, query: { ...baseProps.query, search: 'cat' } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await Promise.resolve();
    });

    expect(ingredientsFindAllMock).toHaveBeenCalledTimes(callsAfterMount + 1);
  });

  it('passes an abort signal so superseded list requests are cancelled on the wire', async () => {
    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const signal = ingredientsFindAllMock.mock.calls[0]?.[1];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('requests keyset pages and appends the next page on demand', async () => {
    const first = [{ id: 'a' }, { id: 'b' }] as IIngredient[];
    const second = [{ id: 'b' }, { id: 'c' }] as IIngredient[];
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({
        hasNext: true,
        hasPrevious: false,
        items: first,
        nextCursor: 'cursor-1',
        page: 1,
        pageSize: 30,
        total: 2,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        hasNext: false,
        hasPrevious: false,
        items: second,
        nextCursor: null,
        page: 1,
        pageSize: 30,
        total: 2,
        totalPages: 1,
      });
    mockGetIngredientsService.mockResolvedValue({ findAllPage });

    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(findAllPage.mock.calls[0]?.[0]).toMatchObject({ paging: 'cursor' });
    expect(result.current.hasMoreIngredients).toBe(true);

    await act(async () => {
      await result.current.loadMoreIngredients();
    });

    expect(findAllPage.mock.calls[1]?.[0]).toMatchObject({
      cursor: 'cursor-1',
      paging: 'cursor',
    });
    expect(result.current.ingredients.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(result.current.hasMoreIngredients).toBe(false);
  });

  it('asks for the next page number when the API answers with page links', async () => {
    const findAllPage = pageOf(async () => [{ id: 'a' }] as IIngredient[], {
      hasNext: true,
      page: 1,
    });
    mockGetIngredientsService.mockResolvedValue({ findAllPage });

    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.loadMoreIngredients();
    });

    expect(findAllPage.mock.calls[1]?.[0]).toMatchObject({ page: 2 });
  });

  it('drops an older page that resolves after the list reloaded', async () => {
    let resolveOlder: ((rows: IIngredient[]) => void) | undefined;
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({
        hasNext: true,
        hasPrevious: false,
        items: [{ id: 'a' }],
        nextCursor: 'cursor-1',
        page: 1,
        pageSize: 30,
        total: 1,
        totalPages: 1,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = (rows) =>
              resolve({
                hasNext: false,
                hasPrevious: false,
                items: rows,
                nextCursor: null,
                page: 1,
                pageSize: 30,
                total: 1,
                totalPages: 1,
              });
          }),
      )
      .mockResolvedValue({
        hasNext: false,
        hasPrevious: false,
        items: [{ id: 'fresh' }],
        nextCursor: null,
        page: 1,
        pageSize: 30,
        total: 1,
        totalPages: 1,
      });
    mockGetIngredientsService.mockResolvedValue({ findAllPage });

    const { result } = renderHook(() => useIngredientsLoading(baseProps));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.loadMoreIngredients();
    });
    await waitFor(() => expect(resolveOlder).toBeDefined());
    await act(async () => result.current.findAllIngredientsByCategory(true));
    await act(async () => {
      resolveOlder?.([{ id: 'stale' }] as IIngredient[]);
      await pending;
    });

    expect(result.current.ingredients.map((item) => item.id)).toEqual([
      'fresh',
    ]);
  });
});
