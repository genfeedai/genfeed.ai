import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useClientPagination } from './use-client-pagination';

const items = Array.from({ length: 30 }, (_, index) => index + 1);

describe('useClientPagination', () => {
  it('slices the first page and reports the totals', () => {
    const { result } = renderHook(() =>
      useClientPagination(items, { pageSize: 12 }),
    );

    expect(result.current.pageItems).toEqual(items.slice(0, 12));
    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalItems).toBe(30);
    expect(result.current.startRank).toBe(1);
  });

  it('moves between pages and clamps out-of-range requests', () => {
    const { result } = renderHook(() =>
      useClientPagination(items, { pageSize: 12 }),
    );

    act(() => result.current.goToPage(3));
    expect(result.current.pageItems).toEqual([25, 26, 27, 28, 29, 30]);
    expect(result.current.startRank).toBe(25);

    act(() => result.current.goToPage(99));
    expect(result.current.currentPage).toBe(3);

    act(() => result.current.goToPage(-4));
    expect(result.current.currentPage).toBe(1);
  });

  it('returns to page 1 when the reset key changes', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useClientPagination(items, { pageSize: 12, resetKey }),
      { initialProps: { resetKey: 'views' } },
    );

    act(() => result.current.goToPage(2));
    expect(result.current.currentPage).toBe(2);

    rerender({ resetKey: 'likes' });
    expect(result.current.currentPage).toBe(1);
  });

  it('clamps the page when the list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useClientPagination(list, { pageSize: 12 }),
      { initialProps: { list: items } },
    );

    act(() => result.current.goToPage(3));
    rerender({ list: items.slice(0, 13) });

    expect(result.current.currentPage).toBe(2);
    expect(result.current.pageItems).toEqual([13]);
  });

  it('is a single empty page for an empty list', () => {
    const { result } = renderHook(() => useClientPagination([]));

    expect(result.current.pageItems).toEqual([]);
    expect(result.current.totalPages).toBe(1);
  });
});
