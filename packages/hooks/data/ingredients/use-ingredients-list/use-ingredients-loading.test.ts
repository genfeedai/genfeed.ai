import { useIngredientsLoading } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-loading';
import { renderHook, waitFor } from '@testing-library/react';
import { PageScope } from '@ui-constants/misc.constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetIngredientsService = vi.fn();
const mockGetFoldersService = vi.fn();
const mockGetOrganizationsService = vi.fn();

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: vi.fn((...args: string[]) => args.join(':')),
  createLocalStorageCache: vi.fn(() => ({
    get: vi.fn(() => null),
    set: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((fn: (token: string) => unknown) => {
    const service = fn('test-token');
    if ((service as { findAll?: unknown }).findAll) {
      return mockGetIngredientsService;
    }
    return mockGetFoldersService;
  }),
}));

vi.mock('@services/content/folders.service', () => ({
  FoldersService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
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
    onRefresh: vi.fn(),
    organizationId: 'org-1',
    parsedSearchParams: new URLSearchParams(),
    query: { category: '', format: '', search: '' },
    scope: PageScope.BRAND,
    setIsRefreshing: vi.fn(),
    singularType: 'video',
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
});
