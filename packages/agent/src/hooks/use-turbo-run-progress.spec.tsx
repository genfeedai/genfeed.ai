import {
  isTurboRunSettled,
  useTurboRunProgress,
} from '@genfeedai/agent/hooks/use-turbo-run-progress';
import { TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function run(status: TurboRunStatus): ITurboRunSummary {
  return {
    brandId: 'brand-1',
    completedCount: 0,
    contentMix: {
      carouselPercent: 0,
      imagePercent: 100,
      reelPercent: 0,
      storyPercent: 0,
      videoPercent: 0,
    },
    createdAt: '2026-10-25T09:00:00Z',
    failedCount: 0,
    id: 'run-1',
    items: [],
    pendingCount: 0,
    platforms: ['twitter'],
    status,
    totalCount: 1,
  };
}

describe('useTurboRunProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until the run settles, then stops', async () => {
    const getTurboRun = vi
      .fn()
      .mockResolvedValueOnce(run(TurboRunStatus.PENDING))
      .mockResolvedValueOnce(run(TurboRunStatus.PROCESSING))
      .mockResolvedValue(run(TurboRunStatus.COMPLETED));

    const api = { getTurboRun };
    const { result } = renderHook(() => useTurboRunProgress(api, 'run-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current?.status).toBe(TurboRunStatus.PENDING);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current?.status).toBe(TurboRunStatus.PROCESSING);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current?.status).toBe(TurboRunStatus.COMPLETED);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(getTurboRun).toHaveBeenCalledTimes(3);
  });

  it('does nothing without a run or a service', async () => {
    const getTurboRun = vi.fn();

    const api = { getTurboRun };
    const withoutRun = renderHook(() => useTurboRunProgress(api, undefined));
    const withoutService = renderHook(() => useTurboRunProgress(null, 'run-1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(getTurboRun).not.toHaveBeenCalled();
    expect(withoutRun.result.current).toBeNull();
    expect(withoutService.result.current).toBeNull();
  });

  it('aborts the request and stops polling on unmount', async () => {
    let signal: AbortSignal | undefined;
    const getTurboRun = vi.fn(
      async (_id: string, requestSignal?: AbortSignal) => {
        signal = requestSignal;
        return run(TurboRunStatus.PROCESSING);
      },
    );

    const api = { getTurboRun };
    const { unmount } = renderHook(() => useTurboRunProgress(api, 'run-1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(signal?.aborted).toBe(true);
    expect(getTurboRun).toHaveBeenCalledTimes(1);
  });

  it('keeps the last state and gives up after repeated failures', async () => {
    const getTurboRun = vi
      .fn()
      .mockResolvedValueOnce(run(TurboRunStatus.PROCESSING))
      .mockRejectedValue(new Error('offline'));

    const api = { getTurboRun };
    const { result } = renderHook(() => useTurboRunProgress(api, 'run-1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current?.status).toBe(TurboRunStatus.PROCESSING);
    // One success, then five consecutive failures.
    expect(getTurboRun).toHaveBeenCalledTimes(6);
  });
});

describe('isTurboRunSettled', () => {
  it.each([
    [TurboRunStatus.COMPLETED, true],
    [TurboRunStatus.PARTIAL, true],
    [TurboRunStatus.FAILED, true],
    [TurboRunStatus.CANCELLED, true],
    [TurboRunStatus.PENDING, false],
    [TurboRunStatus.PROCESSING, false],
  ])('%s -> %s', (status, expected) => {
    expect(isTurboRunSettled(status)).toBe(expected);
  });
});
