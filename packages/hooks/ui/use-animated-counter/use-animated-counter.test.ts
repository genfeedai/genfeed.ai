import { useAnimatedCounter } from '@hooks/ui/use-animated-counter/use-animated-counter';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@hooks/ui/use-intersection-observer/use-intersection-observer',
  () => ({
    useIntersectionObserver: vi.fn(() => ({
      isIntersecting: false,
      ref: { current: null },
    })),
  }),
);

describe('useAnimatedCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ref and value', () => {
    const { result } = renderHook(() => useAnimatedCounter({ end: 100 }));
    expect(result.current).toHaveProperty('ref');
    expect(result.current).toHaveProperty('value');
  });

  // The count-up is decoration. An observer that never reports intersection
  // used to leave the counter on 0 forever, so a KPI card reported a confident
  // wrong number — /automation/runs showed TOTAL 0 above 84 rendered runs.
  it('shows the real value when the observer never fires', () => {
    const { result } = renderHook(() => useAnimatedCounter({ end: 500 }));
    expect(result.current.value).toBe('500');
  });

  it('includes suffix in value', () => {
    const { result } = renderHook(() =>
      useAnimatedCounter({ end: 100, suffix: '%' }),
    );
    expect(result.current.value).toBe('100%');
  });

  it('respects decimals option when not intersecting', () => {
    const { result } = renderHook(() =>
      useAnimatedCounter({ decimals: 2, end: 100 }),
    );
    expect(result.current.value).toBe('100.00');
  });

  it('returns string value even with end=0', () => {
    const { result } = renderHook(() => useAnimatedCounter({ end: 0 }));
    expect(typeof result.current.value).toBe('string');
    expect(result.current.value).toBe('0');
  });
});
