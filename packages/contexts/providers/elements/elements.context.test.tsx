import {
  ElementsContext,
  type ElementsContextValue,
  useElementsContext,
} from '@providers/elements/elements.context';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

function createValue(
  overrides: Partial<ElementsContextValue> = {},
): ElementsContextValue {
  return {
    blacklists: [],
    cameraMovements: [],
    cameras: [],
    error: null,
    filters: { format: '', provider: '', search: '', status: '', type: '' },
    isLoading: false,
    isRefreshing: false,
    lenses: [],
    lightings: [],
    moods: [],
    query: {},
    refetch: async () => undefined,
    scenes: [],
    setFilters: () => undefined,
    setIsRefreshing: () => undefined,
    setQuery: () => undefined,
    sounds: [],
    styles: [],
    ...overrides,
  };
}

function wrapperFor(value: ElementsContextValue) {
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <ElementsContext.Provider value={value}>
        {children}
      </ElementsContext.Provider>
    );
  };
}

describe('useElementsContext', () => {
  it('returns the catalogs the provider holds', () => {
    const value = createValue({ moods: [{ id: 'mood-1' } as never] });

    const { result } = renderHook(() => useElementsContext(), {
      wrapper: wrapperFor(value),
    });

    expect(result.current.moods).toEqual([{ id: 'mood-1' }]);
  });

  it('asks the provider to start loading once a consumer mounts', () => {
    const requestLoad = vi.fn();

    renderHook(() => useElementsContext(), {
      wrapper: wrapperFor(createValue({ requestLoad })),
    });

    expect(requestLoad).toHaveBeenCalledTimes(1);
  });

  it('refuses a consumer outside the provider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => renderHook(() => useElementsContext())).toThrow(
      'useElementsContext must be used within an ElementsProvider',
    );

    consoleError.mockRestore();
  });
});
