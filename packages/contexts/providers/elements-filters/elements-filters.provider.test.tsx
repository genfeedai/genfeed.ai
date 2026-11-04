import { useElementsFilters } from '@providers/elements-filters/elements-filters.context';
import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

function wrapper({ children }: { children: ReactNode }) {
  return <ElementsFiltersProvider>{children}</ElementsFiltersProvider>;
}

describe('ElementsFiltersProvider', () => {
  it('renders its children', () => {
    render(
      <ElementsFiltersProvider>
        <span>test</span>
      </ElementsFiltersProvider>,
    );

    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('starts from empty filters, an empty query and no refresh in flight', () => {
    const { result } = renderHook(() => useElementsFilters(), { wrapper });

    expect(result.current.filters).toEqual({
      format: '',
      provider: '',
      search: '',
      status: '',
      type: '',
    });
    expect(result.current.query).toEqual({});
    expect(result.current.isRefreshing).toBe(false);
  });

  it('keeps the filters, query and refresh state a consumer sets', () => {
    const { result } = renderHook(() => useElementsFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ ...result.current.filters, search: 'neon' });
      result.current.setQuery({ search: 'neon' });
      result.current.setIsRefreshing(true);
    });

    expect(result.current.filters.search).toBe('neon');
    expect(result.current.query).toEqual({ search: 'neon' });
    expect(result.current.isRefreshing).toBe(true);
  });

  it('refuses a consumer outside the provider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => renderHook(() => useElementsFilters())).toThrow(
      'useElementsFilters must be used within an ElementsFiltersProvider',
    );

    consoleError.mockRestore();
  });
});
