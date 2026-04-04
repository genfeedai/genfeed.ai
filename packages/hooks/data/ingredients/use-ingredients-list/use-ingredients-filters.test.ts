import { IngredientFormat } from '@genfeedai/enums';
import {
  isIngredientFormat,
  useIngredientsFilters,
} from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-filters';
import { renderHook } from '@testing-library/react';
import { PageScope } from '@ui-constants/misc.constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  useIngredientsContext: vi.fn(() => ({
    filters: { format: 'all' },
    onRefresh: vi.fn(),
    query: {},
    setIsRefreshing: vi.fn(),
    setQuery: vi.fn(),
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@genfeedai/client/schemas', () => ({
  ingredientCategorySchema: {
    '~standard': {
      validate: vi.fn((data) => ({ value: data })),
      vendor: 'test',
      version: 1,
    },
  },
}));

vi.mock('@hookform/resolvers/standard-schema', () => ({
  standardSchemaResolver: vi.fn(() => vi.fn()),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/ingredients'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    control: {},
    getValues: vi.fn(() => ({})),
    handleSubmit: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
  })),
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
    expect(result.current).toHaveProperty('form');
  });

  it('singularType removes last char from type', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.BRAND, type: 'videos' }),
    );
    expect(result.current.singularType).toBe('video');
  });

  it('isActionsEnabled is false for SUPERADMIN scope', () => {
    const { result } = renderHook(() =>
      useIngredientsFilters({ scope: PageScope.SUPERADMIN, type: 'images' }),
    );
    expect(result.current.isActionsEnabled).toBe(false);
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
