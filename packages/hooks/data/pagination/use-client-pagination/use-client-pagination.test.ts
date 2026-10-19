import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useClientPagination } from './use-client-pagination';

const items = Array.from({ length: 25 }, (_, index) => index + 1);

describe('useClientPagination', () => {
  it('slices the list into pages', () => {
    const { result } = renderHook(() => useClientPagination(items, 10));

    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toEqual(items.slice(0, 10));

    act(() => result.current.setPage(3));

    expect(result.current.currentPage).toBe(3);
    expect(result.current.pageItems).toEqual([21, 22, 23, 24, 25]);
  });

  it('snaps back into range when the list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useClientPagination(list, 10),
      { initialProps: { list: items } },
    );
    act(() => result.current.setPage(3));

    rerender({ list: items.slice(0, 5) });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports a single empty page for an empty list', () => {
    const { result } = renderHook(() => useClientPagination([], 10));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
