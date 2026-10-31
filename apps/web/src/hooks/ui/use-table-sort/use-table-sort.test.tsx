// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: 'status=active&page=3&sort=-name',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/org/brand/campaigns',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const allowedKeys = ['name', 'status'];

describe('useTableSort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = 'status=active&page=3&sort=-name';
  });

  it('reads a descending sort from the URL as the endpoint sort string', () => {
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    expect(result.current.sortKey).toBe('name');
    expect(result.current.sortDirection).toBe('desc');
    expect(result.current.sort).toBe('name: -1');
  });

  it('reads an ascending sort', () => {
    mocks.search = 'sort=status';
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    expect(result.current.sortDirection).toBe('asc');
    expect(result.current.sort).toBe('status: 1');
  });

  it('ignores a sort key the list cannot order by', () => {
    mocks.search = 'sort=passwordHash';
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    expect(result.current.sortKey).toBeUndefined();
    expect(result.current.sort).toBeUndefined();
  });

  it('keeps the server default when there is no sort', () => {
    mocks.search = '';
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    expect(result.current.sort).toBeUndefined();
  });

  it('writes the sort, keeps the other params and returns to the first page', () => {
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    act(() => result.current.onSortChange('status', 'asc'));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/org/brand/campaigns?status=active&sort=status',
      { scroll: false },
    );
  });

  it('writes a descending sort with a leading dash', () => {
    const { result } = renderHook(() => useTableSort({ allowedKeys }));

    act(() => result.current.onSortChange('name', 'desc'));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/org/brand/campaigns?status=active&sort=-name',
      { scroll: false },
    );
  });
});
