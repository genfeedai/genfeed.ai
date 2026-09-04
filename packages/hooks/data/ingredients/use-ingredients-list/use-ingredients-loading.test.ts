import { IngredientCategory, PageScope } from '@genfeedai/contracts';
import { useIngredientsLoading } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-loading';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('useIngredientsLoading', () => {
  let ingredientsFindAllMock: ReturnType<typeof vi.fn>;
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
    ingredientsFindAllMock = vi.fn().mockResolvedValue([]);
    mockGetIngredientsService.mockResolvedValue({
      findAll: ingredientsFindAllMock,
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
    // isLoading is a boolean
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
});
