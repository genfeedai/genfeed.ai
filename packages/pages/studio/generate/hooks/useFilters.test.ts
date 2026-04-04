// @vitest-environment jsdom

import { IngredientCategory } from '@genfeedai/enums';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFilters } from './useFilters';

describe('useFilters', () => {
  const baseProps = {
    brandId: 'brand-1',
    setAllAssets: vi.fn(),
    setCurrentPage: vi.fn(),
    setLoadedPages: vi.fn(),
    setPromptConfig: vi.fn(),
  };

  it('does not force the prompt format into the gallery filter by default', () => {
    const { result } = renderHook(() =>
      useFilters({
        ...baseProps,
        categoryType: IngredientCategory.IMAGE,
        initialFormat: '',
      }),
    );

    expect(result.current.filters.format).toBe('');
  });
});
