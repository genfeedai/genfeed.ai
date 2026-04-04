import useTableColumns from '@pages/studio/generate/hooks/useTableColumns';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('useTableColumns', () => {
  it('should return table columns configuration', () => {
    const { result } = renderHook(() => useTableColumns());
    expect(result.current).toBeDefined();
    expect(Array.isArray(result.current)).toBe(true);
  });

  it('should have columns with required properties', () => {
    const { result } = renderHook(() => useTableColumns());
    const columns = result.current;

    columns.forEach((column) => {
      expect(column).toHaveProperty('key');
      expect(column).toHaveProperty('header');
    });
  });
});
