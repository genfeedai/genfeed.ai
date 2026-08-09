import { useVideoTrim } from '@hooks/media/use-video-trim/use-video-trim';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/logger.service', () => ({
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

interface FakeVideoElement {
  addEventListener: (event: string, listener: () => void) => void;
  currentTime: number;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  readyState: number;
  removeEventListener: (event: string, listener: () => void) => void;
}

function createFakeVideo(): FakeVideoElement {
  const listeners = new Map<string, Set<() => void>>();
  let currentTime = 0;

  const video: FakeVideoElement = {
    addEventListener: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(time: number) {
      currentTime = time;
      for (const listener of [...(listeners.get('seeked') ?? [])]) {
        listener();
      }
    },
    pause: vi.fn(),
    play: vi.fn(),
    readyState: 2,
    removeEventListener: (event, listener) => {
      listeners.get(event)?.delete(listener);
    },
  };

  return video;
}

describe('useVideoTrim video element interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seekTo updates the video and current time', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
    const video = createFakeVideo();
    result.current.videoRef.current = video as unknown as HTMLVideoElement;

    act(() => {
      result.current.seekTo(7);
    });

    expect(video.currentTime).toBe(7);
    expect(result.current.currentTime).toBe(7);
  });

  it('seekTo is a no-op without a video element', () => {
    const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));

    act(() => {
      result.current.seekTo(7);
    });

    expect(result.current.currentTime).toBe(0);
  });

  it('playTrimmedPortion plays from start and pauses at the end time', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });
    const cancelSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    try {
      const { result } = renderHook(() => useVideoTrim({ videoDuration: 30 }));
      const video = createFakeVideo();
      result.current.videoRef.current = video as unknown as HTMLVideoElement;

      act(() => {
        result.current.setStartTime(2);
        result.current.setEndTime(10);
      });

      act(() => {
        result.current.playTrimmedPortion();
      });

      expect(video.play).toHaveBeenCalled();
      expect(video.currentTime).toBe(2);

      // First frame: still before end time — keeps polling
      act(() => {
        rafCallbacks[0](0);
      });
      expect(video.pause).not.toHaveBeenCalled();

      // Simulate playback passing the end time
      video.currentTime = 11;
      act(() => {
        rafCallbacks.at(-1)?.(0);
      });

      expect(video.pause).toHaveBeenCalled();
      expect(video.currentTime).toBe(2);
    } finally {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    }
  });

  it('generates thumbnails when the video metadata is ready', async () => {
    const fakeContext = { drawImage: vi.fn() };
    const fakeCanvas = {
      getContext: vi.fn(() => fakeContext),
      height: 0,
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,thumb'),
      width: 0,
    };
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) =>
        tag === 'canvas'
          ? (fakeCanvas as unknown as HTMLCanvasElement)
          : originalCreateElement(tag),
      );

    try {
      const { rerender, result } = renderHook(
        ({ videoDuration }) => useVideoTrim({ videoDuration }),
        { initialProps: { videoDuration: 10 } },
      );

      const video = createFakeVideo();
      result.current.videoRef.current = video as unknown as HTMLVideoElement;

      // Changing duration re-runs the thumbnail effect with the ref attached
      await act(async () => {
        rerender({ videoDuration: 20 });
      });

      expect(result.current.thumbnails).toHaveLength(10);
      expect(result.current.thumbnails[0]).toEqual({
        dataUrl: 'data:image/jpeg;base64,thumb',
        time: 0,
      });
      expect(fakeContext.drawImage).toHaveBeenCalledTimes(10);
      expect(result.current.isGeneratingThumbnails).toBe(false);
      expect(result.current.error).toBeNull();
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('reports an error when the canvas context is unavailable', async () => {
    const fakeCanvas = {
      getContext: vi.fn(() => null),
      height: 0,
      toDataURL: vi.fn(),
      width: 0,
    };
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) =>
        tag === 'canvas'
          ? (fakeCanvas as unknown as HTMLCanvasElement)
          : originalCreateElement(tag),
      );

    try {
      const { rerender, result } = renderHook(
        ({ videoDuration }) => useVideoTrim({ videoDuration }),
        { initialProps: { videoDuration: 10 } },
      );

      const video = createFakeVideo();
      result.current.videoRef.current = video as unknown as HTMLVideoElement;

      await act(async () => {
        rerender({ videoDuration: 20 });
      });

      expect(result.current.error).toBe('Failed to generate thumbnails');
      expect(result.current.thumbnails).toEqual([]);
    } finally {
      createElementSpy.mockRestore();
    }
  });
});
