import { SocketManager } from '@genfeedai/services/core/socket-manager.service';
import { useMergeProgress } from '@hooks/storyboard/use-merge-progress/use-merge-progress';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptions = new Map<string, (payload: unknown) => void>();
const unsubscribeMap = new Map<string, ReturnType<typeof vi.fn>>();

const subscribeMock = vi.fn(
  (event: string, handler: (payload: unknown) => void) => {
    subscriptions.set(event, handler);
    const unsubscribe = vi.fn();
    unsubscribeMap.set(event, unsubscribe);
    return unsubscribe;
  },
);

vi.mock('@genfeedai/services/core/socket-manager.service', () => ({
  SocketManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useMergeProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.clear();
    unsubscribeMap.clear();
    (SocketManager.getInstance as ReturnType<typeof vi.fn>).mockReturnValue({
      subscribe: subscribeMock,
    });
  });

  it('builds steps based on configuration', () => {
    const { result } = renderHook(() =>
      useMergeProgress({
        hasMusic: true,
        hasResize: true,
        ingredientId: 'video-1',
      }),
    );

    expect(result.current.steps).toHaveLength(5);
    expect(result.current.steps[0].id).toBe('download');
    expect(result.current.steps[1].id).toBe('download-music');
    expect(result.current.steps[2].id).toBe('merge');
    expect(result.current.steps[3].id).toBe('resize');
    expect(result.current.steps[4].id).toBe('upload');
  });

  it('subscribes to merge events for the ingredient', () => {
    renderHook(() =>
      useMergeProgress({
        ingredientId: 'video-1',
      }),
    );

    expect(subscribeMock).toHaveBeenCalledTimes(3);
    expect(subscriptions.has('/videos/video-1')).toBe(true);
    expect(subscriptions.has('video-progress')).toBe(true);
    expect(subscriptions.has('video-complete')).toBe(true);
  });

  it('updates progress when receiving processing events', () => {
    const { result } = renderHook(() =>
      useMergeProgress({
        ingredientId: 'video-1',
      }),
    );

    const pathHandler = subscriptions.get('/videos/video-1');

    act(() => {
      pathHandler?.({
        progress: {
          currentStepLabel: 'Downloading files',
          percent: 25,
          step: 'downloading',
          stepProgress: 40,
        },
        status: 'processing',
      });
    });

    expect(result.current.overallProgress).toBe(25);
    expect(result.current.steps[0].status).toBe('active');
    expect(result.current.steps[0].progress).toBe(40);
    expect(result.current.steps[0].label).toBe('Downloading files');
  });

  it('marks steps complete on success event', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useMergeProgress({
        ingredientId: 'video-1',
        onComplete,
      }),
    );

    const completeHandler = subscriptions.get('video-complete');

    act(() => {
      completeHandler?.({ path: '/videos/video-1' });
    });

    expect(result.current.overallProgress).toBe(100);
    expect(
      result.current.steps.every((step) => step.status === 'completed'),
    ).toBe(true);
    expect(onComplete).toHaveBeenCalled();
  });

  it('marks current step as failed and calls onError', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useMergeProgress({
        ingredientId: 'video-1',
        onError,
      }),
    );

    const pathHandler = subscriptions.get('/videos/video-1');

    act(() => {
      pathHandler?.({
        progress: {
          step: 'downloading',
          stepProgress: 10,
        },
        status: 'processing',
      });
    });

    act(() => {
      pathHandler?.({
        error: 'Merge failed',
        status: 'failed',
      });
    });

    expect(result.current.steps[0].status).toBe('failed');
    expect(onError).toHaveBeenCalledWith('Merge failed');
  });

  it('cleans up subscriptions on unmount', () => {
    const { unmount } = renderHook(() =>
      useMergeProgress({
        ingredientId: 'video-1',
      }),
    );

    unmount();

    expect(unsubscribeMap.get('/videos/video-1')).toHaveBeenCalled();
    expect(unsubscribeMap.get('video-progress')).toHaveBeenCalled();
    expect(unsubscribeMap.get('video-complete')).toHaveBeenCalled();
  });
});
