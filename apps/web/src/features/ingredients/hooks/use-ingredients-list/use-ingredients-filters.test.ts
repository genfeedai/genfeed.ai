import {
  IngredientCategory,
  IngredientFormat,
  PageScope,
} from '@genfeedai/contracts';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isIngredientFormat,
  useIngredientsFilters,
} from '@/features/ingredients/hooks/use-ingredients-list/use-ingredients-filters';

vi.mock(
  '@genfeedai/contexts/content/ingredients-context/ingredients-context',
  () => ({
    useIngredientsContext: vi.fn(() => ({
      filters: { format: 'all' },
      onRefresh: vi.fn(),
      query: {},
      setIsRefreshing: vi.fn(),
      setQuery: vi.fn(),
    })),
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/ingredients'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe('isIngredientFormat', () => {
  it('returns true for valid ingredient formats', () => {
    expect(isIngredientFormat(IngredientFormat.LANDSCAPE)).toBe(true);
    expect(isIngredientFormat(IngredientFormat.PORTRAIT)).toBe(true);
    expect(isIngredientFormat(IngredientFormat.SQUARE)).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isIngredientFormat('invalid')).toBe(false);
    expect(isIngredientFormat(null)).toBe(false);
    expect(isIngredientFormat(undefined)).toBe(false);
  });
});

describe('useIngredientsFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required fields', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'videos' }),
    );
    expect(result.current).toHaveProperty('singularType');
    expect(result.current).toHaveProperty('isActionsEnabled');
    expect(result.current).toHaveProperty('formatFilter');
    expect(result.current).toHaveProperty('clearFilters');
    expect(result.current).toHaveProperty('brandId');
    expect(result.current).toHaveProperty('query');
  });

  it('singularType normalizes the route plural to an IngredientCategory', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'videos' }),
    );
    expect(result.current.singularType).toBe(IngredientCategory.VIDEO);
  });

  it('singularType keeps the raw singular for unknown route plurals', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'widgets' }),
    );
    expect(result.current.singularType).toBe('widget');
  });

  it('isActionsEnabled is false for SUPERADMIN scope', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.SUPERADMIN, type: 'images' }),
    );
    expect(result.current.isActionsEnabled).toBe(false);
  });

  it('isActionsEnabled is true for ORGANIZATION scope, like a brand', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.ORGANIZATION, type: 'videos' }),
    );
    expect(result.current.isActionsEnabled).toBe(true);
  });

  it('isActionsEnabled is true for BRAND scope', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'images' }),
    );
    expect(result.current.isActionsEnabled).toBe(true);
  });

  it('formatFilter is undefined when filter is "all"', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'images' }),
    );
    expect(result.current.formatFilter).toBeUndefined();
  });
});
