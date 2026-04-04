import { useDelayedVisibility } from '@hooks/ui/use-delayed-visibility/use-delayed-visibility';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useDelayedVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true immediately when delay is 0 and enabled', () => {
    const { result } = renderHook(() =>
      useDelayedVisibility({ delay: 0, enabled: true }),
    );
    expect(result.current).toBe(true);
  });

  it('returns false initially when delay > 0', () => {
    const { result } = renderHook(() =>
      useDelayedVisibility({ delay: 500, enabled: true }),
    );
    expect(result.current).toBe(false);
  });

  it('returns true after the specified delay', () => {
    const { result } = renderHook(() =>
      useDelayedVisibility({ delay: 500, enabled: true }),
    );
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(true);
  });

  it('returns false when disabled', () => {
    const { result } = renderHook(() =>
      useDelayedVisibility({ enabled: false }),
    );
    expect(result.current).toBe(false);
  });

  it('returns false with default options (delay=0, enabled=true → true)', () => {
    const { result } = renderHook(() => useDelayedVisibility());
    // Default: delay=0, enabled=true → visible immediately
    expect(result.current).toBe(true);
  });
});
