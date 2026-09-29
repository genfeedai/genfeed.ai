import { useMounted } from '@hooks/utils/use-mounted/use-mounted';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('useMounted', () => {
  it('maintains true value after re-renders', () => {
    const { result, rerender } = renderHook(() => useMounted());

    // Should be true after mount
    expect(result.current).toBe(true);

    // Should remain true after re-render
    rerender();
    expect(result.current).toBe(true);

    // Multiple re-renders should not change the value
    rerender();
    rerender();
    expect(result.current).toBe(true);
  });

  it('works with multiple instances', () => {
    const { result: result1 } = renderHook(() => useMounted());
    const { result: result2 } = renderHook(() => useMounted());

    expect(result1.current).toBe(true);
    expect(result2.current).toBe(true);
  });
});
