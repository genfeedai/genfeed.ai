import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestItem {
  id: number;
  name?: string;
}

describe('useFilteredData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns filtered data', () => {
    const mockData: TestItem[] = [{ id: 1, name: 'Test' }];
    const { result } = renderHook(() =>
      useFilteredData({
        data: mockData,
        filter: 'Test',
        filterFields: (item) => [item.name ?? ''],
      }),
    );

    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current).toHaveLength(1);
  });

  it('filters data based on predicate', () => {
    const mockData: TestItem[] = [
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
      { id: 3, name: 'Cherry' },
    ];
    const { result } = renderHook(() =>
      useFilteredData({
        data: mockData,
        filter: 'an',
        filterFields: (item) => [item.name ?? ''],
      }),
    );

    // 'an' matches 'Banana' only
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('Banana');
  });

  it('returns all data when filter is empty', () => {
    const mockData: TestItem[] = [
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ];
    const { result } = renderHook(() =>
      useFilteredData({
        data: mockData,
        filter: '',
        filterFields: (item) => [item.name ?? ''],
      }),
    );

    expect(result.current).toHaveLength(2);
  });
});
