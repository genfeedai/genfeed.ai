import { usePagination } from '@hooks/data/pagination/use-pagination/use-pagination';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('usePagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pagination state and controls', () => {
    const { result } = renderHook(() => usePagination({ pageSize: 10 }));

    expect(result.current).toHaveProperty('currentPage');
    expect(result.current).toHaveProperty('totalPages');
    expect(result.current).toHaveProperty('nextPage');
    expect(result.current).toHaveProperty('previousPage');
    expect(result.current).toHaveProperty('goToPage');
    expect(result.current).toHaveProperty('setTotalPages');
    expect(result.current).toHaveProperty('hasMore');
    expect(result.current).toHaveProperty('hasPrevious');
  });

  it('sets total pages dynamically', () => {
    const { result } = renderHook(() => usePagination({ pageSize: 10 }));

    act(() => {
      result.current.setTotalPages(10);
    });

    expect(result.current.totalPages).toBe(10);
  });

  it('handles page navigation', () => {
    const { result } = renderHook(() => usePagination({ pageSize: 10 }));

    // Set total pages to allow navigation
    act(() => {
      result.current.setTotalPages(10);
    });

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.currentPage).toBe(2);
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => usePagination());

    expect(result.current.currentPage).toBe(1);
    expect(result.current.pageSize).toBe(24);
    expect(result.current.totalPages).toBe(1);
  });

  it('respects initialPage option', () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 5, pageSize: 10 }),
    );

    // Need to set total pages to make initialPage valid
    act(() => {
      result.current.setTotalPages(10);
    });

    expect(result.current.currentPage).toBe(5);
  });
});
