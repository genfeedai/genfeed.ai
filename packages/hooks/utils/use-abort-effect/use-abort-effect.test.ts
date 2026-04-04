import { useAbortEffect } from '@hooks/utils/use-abort-effect/use-abort-effect';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('useAbortEffect', () => {
  it('calls the effect with an AbortSignal', () => {
    const effect = vi.fn();
    renderHook(() => useAbortEffect(effect, []));
    expect(effect).toHaveBeenCalledOnce();
    const signal = effect.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('aborts the signal on unmount', () => {
    let capturedSignal: AbortSignal | null = null;
    const effect = vi.fn((signal: AbortSignal) => {
      capturedSignal = signal;
    });
    const { unmount } = renderHook(() => useAbortEffect(effect, []));
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('re-runs the effect when deps change', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(
      ({ dep }) => useAbortEffect(effect, [dep]),
      { initialProps: { dep: 'a' } },
    );
    expect(effect).toHaveBeenCalledTimes(1);
    rerender({ dep: 'b' });
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('aborts the previous signal when deps change', () => {
    const signals: AbortSignal[] = [];
    const effect = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
    });
    const { rerender } = renderHook(
      ({ dep }) => useAbortEffect(effect, [dep]),
      { initialProps: { dep: 'a' } },
    );
    rerender({ dep: 'b' });
    // The first signal should be aborted
    expect(signals[0].aborted).toBe(true);
    // The second signal should still be active
    expect(signals[1].aborted).toBe(false);
  });
});
