import { useVideoTrim } from '@hooks/media/use-video-trim/use-video-trim';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('useVideoTrim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all video trim controls', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    expect(result.current).toHaveProperty('startTime');
    expect(result.current).toHaveProperty('endTime');
    expect(result.current).toHaveProperty('trimDuration');
    expect(result.current).toHaveProperty('isValid');
    expect(result.current).toHaveProperty('setStartTime');
    expect(result.current).toHaveProperty('setEndTime');
    expect(result.current).toHaveProperty('handleRangeChange');
    expect(result.current).toHaveProperty('seekTo');
    expect(result.current).toHaveProperty('videoRef');
    expect(result.current).toHaveProperty('canvasRef');
    expect(result.current).toHaveProperty('thumbnails');
    expect(result.current).toHaveProperty('error');
  });

  it('initializes startTime to 0', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    expect(result.current.startTime).toBe(0);
  });

  it('initializes endTime to min(duration, maxDuration)', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    // default maxDuration is 15
    expect(result.current.endTime).toBe(15);
  });

  it('caps endTime at video duration when duration < maxDuration', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 5 }));
    expect(result.current.endTime).toBe(5);
  });

  it('calculates trimDuration correctly', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    expect(result.current.trimDuration).toBe(
      result.current.endTime - result.current.startTime,
    );
  });

  it('isValid is true when trimDuration is within bounds', () => {
    const { result } = renderHook(() =>
      useVideoTrim({ maxDuration: 15, minDuration: 2, videoDuration: 30 }),
    );
    // endTime = 15, startTime = 0, trimDuration = 15 which <= 15 and >= 2
    expect(result.current.isValid).toBe(true);
  });

  it('isValid is false when trimDuration is too short', () => {
    const { result } = renderHook(() =>
      useVideoTrim({ minDuration: 2, videoDuration: 1 }),
    );
    // endTime = 1, startTime = 0, trimDuration = 1 < minDuration = 2
    expect(result.current.isValid).toBe(false);
  });

  it('handleRangeChange updates startTime and endTime', () => {
    const { result } = renderHook(() =>
      useVideoTrim({ maxDuration: 20, minDuration: 2, videoDuration: 30 }),
    );
    act(() => {
      result.current.handleRangeChange([5, 15]);
    });
    expect(result.current.startTime).toBe(5);
    expect(result.current.endTime).toBe(15);
  });

  it('handleRangeChange ignores range below minDuration', () => {
    const { result } = renderHook(() =>
      useVideoTrim({ minDuration: 5, videoDuration: 30 }),
    );
    const { startTime, endTime } = result.current;
    act(() => {
      result.current.handleRangeChange([10, 11]); // only 1 second apart
    });
    // Values should remain unchanged since 11-10=1 < minDuration=5
    expect(result.current.startTime).toBe(startTime);
    expect(result.current.endTime).toBe(endTime);
  });

  it('handleRangeChange ignores range above maxDuration', () => {
    const { result } = renderHook(() =>
      useVideoTrim({ maxDuration: 10, videoDuration: 60 }),
    );
    const { startTime, endTime } = result.current;
    act(() => {
      result.current.handleRangeChange([0, 20]); // 20 seconds > maxDuration=10
    });
    expect(result.current.startTime).toBe(startTime);
    expect(result.current.endTime).toBe(endTime);
  });

  it('setStartTime manually updates start', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    act(() => {
      result.current.setStartTime(3);
    });
    expect(result.current.startTime).toBe(3);
  });

  it('setEndTime manually updates end', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    act(() => {
      result.current.setEndTime(10);
    });
    expect(result.current.endTime).toBe(10);
  });

  it('initializes thumbnails as empty array', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    expect(result.current.thumbnails).toEqual([]);
  });

  it('initializes error as null', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    expect(result.current.error).toBeNull();
  });
});
