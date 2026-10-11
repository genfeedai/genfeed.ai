import {
  STALLED_TURN_THRESHOLD_MS,
  useStalledTurn,
} from '@genfeedai/agent/hooks/use-stalled-turn';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useStalledTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not stalled just before the threshold and stalled at it', () => {
    const { result } = renderHook(() =>
      useStalledTurn({ isActive: true, progressKey: 'a' }),
    );

    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS - 1);
    });
    expect(result.current.isStalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isStalled).toBe(true);
  });

  it('restarts the clock whenever the turn makes progress', () => {
    const { result, rerender } = renderHook(
      ({ progressKey }) => useStalledTurn({ isActive: true, progressKey }),
      { initialProps: { progressKey: 'a' } },
    );

    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS - 1_000);
    });
    rerender({ progressKey: 'b' });
    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS - 1_000);
    });
    expect(result.current.isStalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.isStalled).toBe(true);
  });

  it('never stalls an inactive turn', () => {
    const { result } = renderHook(() =>
      useStalledTurn({ isActive: false, progressKey: 'a' }),
    );

    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS * 2);
    });
    expect(result.current.isStalled).toBe(false);
  });

  it('keepWaiting dismisses the notice until another full window passes', () => {
    const { result } = renderHook(() =>
      useStalledTurn({ isActive: true, progressKey: 'a' }),
    );

    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS);
    });
    expect(result.current.isStalled).toBe(true);

    act(() => {
      result.current.keepWaiting();
    });
    expect(result.current.isStalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(STALLED_TURN_THRESHOLD_MS - 1);
    });
    expect(result.current.isStalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isStalled).toBe(true);
  });

  it('reports a stall the runtime already proved without waiting', () => {
    const { result } = renderHook(() =>
      useStalledTurn({
        isActive: true,
        isForcedStalled: true,
        progressKey: 'a',
      }),
    );

    expect(result.current.isStalled).toBe(true);
  });
});
