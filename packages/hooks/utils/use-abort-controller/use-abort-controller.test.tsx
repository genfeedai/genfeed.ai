import {
  isAbortError,
  useAbortController,
  useAbortControllerEnhanced,
  useCombinedAbortSignal,
  useMultipleAbortControllers,
  withAbortAndTimeout,
  withAbortSignal,
} from '@hooks/utils/use-abort-controller/use-abort-controller';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

describe('useAbortController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates AbortController on mount', () => {
    const { result } = renderHook(() => useAbortController());

    expect(result.current).toBeInstanceOf(AbortController);
    expect(result.current.signal.aborted).toBe(false);
  });

  it('creates new AbortController when dependencies change', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAbortController(deps),
      { initialProps: { deps: ['dep1'] } },
    );

    const firstController = result.current;

    rerender({ deps: ['dep2'] });

    expect(result.current).not.toBe(firstController);
    expect(result.current.signal.aborted).toBe(false);
  });

  it('aborts controller on unmount', () => {
    const { result, unmount } = renderHook(() => useAbortController());

    const controller = result.current;
    expect(controller.signal.aborted).toBe(false);

    unmount();

    expect(controller.signal.aborted).toBe(true);
  });

  it('aborts previous controller when dependencies change', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAbortController(deps),
      { initialProps: { deps: ['dep1'] } },
    );

    const firstController = result.current;

    rerender({ deps: ['dep2'] });

    expect(firstController.signal.aborted).toBe(true);
  });
});

describe('useAbortControllerEnhanced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates enhanced controller with default config', () => {
    const { result } = renderHook(() => useAbortControllerEnhanced());

    expect(result.current.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.isAborted).toBe(false);
    expect(typeof result.current.abort).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('creates controller with timeout', () => {
    const { result } = renderHook(() =>
      useAbortControllerEnhanced({ timeout: 1000 }),
    );

    expect(result.current.signal.aborted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isAborted).toBe(true);
  });

  it('aborts with custom reason', () => {
    const { result } = renderHook(() =>
      useAbortControllerEnhanced({ reason: 'Custom reason' }),
    );

    act(() => {
      result.current.abort('Manual abort');
    });

    expect(result.current.isAborted).toBe(true);
  });

  it('resets controller', () => {
    const { result } = renderHook(() => useAbortControllerEnhanced());

    act(() => {
      result.current.abort();
    });

    expect(result.current.isAborted).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isAborted).toBe(false);
  });

  it('auto-aborts on unmount by default', () => {
    const { result, unmount } = renderHook(() => useAbortControllerEnhanced());

    const controller = result.current;
    expect(controller.isAborted).toBe(false);

    unmount();

    expect(controller.isAborted).toBe(true);
  });

  it('does not auto-abort when disabled', () => {
    const { result, unmount } = renderHook(() =>
      useAbortControllerEnhanced({ autoAbort: false }),
    );

    const controller = result.current;
    expect(controller.isAborted).toBe(false);

    unmount();

    expect(controller.isAborted).toBe(false);
  });
});

describe('useMultipleAbortControllers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates multiple controllers', () => {
    const { result } = renderHook(() =>
      useMultipleAbortControllers(['controller1', 'controller2']),
    );

    expect(result.current.controller1).toBeDefined();
    expect(result.current.controller2).toBeDefined();
    expect(result.current.controller1.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.controller2.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts individual controllers', () => {
    const { result } = renderHook(() =>
      useMultipleAbortControllers(['controller1', 'controller2']),
    );

    act(() => {
      result.current.controller1.abort('Manual abort');
    });

    expect(result.current.controller1.isAborted).toBe(true);
    expect(result.current.controller2.isAborted).toBe(false);
  });

  it('aborts all controllers', () => {
    const { result } = renderHook(() =>
      useMultipleAbortControllers(['controller1', 'controller2']),
    );

    act(() => {
      result.current.controller1.abortAll('Abort all');
    });

    expect(result.current.controller1.isAborted).toBe(true);
    expect(result.current.controller2.isAborted).toBe(true);
  });

  it('resets individual controllers', () => {
    const { result } = renderHook(() =>
      useMultipleAbortControllers(['controller1', 'controller2']),
    );

    act(() => {
      result.current.controller1.abort();
      result.current.controller1.reset();
    });

    expect(result.current.controller1.isAborted).toBe(false);
  });
});

describe('useCombinedAbortSignal', () => {
  it('combines multiple signals', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    const { result } = renderHook(() =>
      useCombinedAbortSignal([controller1.signal, controller2.signal]),
    );

    expect(result.current).toBeInstanceOf(AbortSignal);
    expect(result.current.aborted).toBe(false);
  });

  it('aborts when any signal is aborted', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    const { result } = renderHook(() =>
      useCombinedAbortSignal([controller1.signal, controller2.signal]),
    );

    act(() => {
      controller1.abort();
    });

    expect(result.current.aborted).toBe(true);
  });

  it('handles undefined signals', () => {
    const controller = new AbortController();

    const { result } = renderHook(() =>
      useCombinedAbortSignal([controller.signal, undefined]),
    );

    expect(result.current).toBeInstanceOf(AbortSignal);
  });
});

describe('isAbortError', () => {
  it('detects AbortError', () => {
    const error = new DOMException('Operation aborted', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('returns false for other errors', () => {
    const error = new Error('Regular error');
    expect(isAbortError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isAbortError('string')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe('withAbortSignal', () => {
  it('executes function with signal', async () => {
    const mockFn = vi.fn().mockResolvedValue('result');
    const wrappedFn = withAbortSignal(mockFn);
    const controller = new AbortController();

    const result = await wrappedFn(controller.signal);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith(controller.signal);
  });

  it('returns null for aborted operations', async () => {
    const mockFn = vi.fn().mockResolvedValue('result');
    const wrappedFn = withAbortSignal(mockFn);
    const controller = new AbortController();

    controller.abort();

    const result = await wrappedFn(controller.signal);

    expect(result).toBeNull();
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('throws non-abort errors', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const wrappedFn = withAbortSignal(mockFn);
    const controller = new AbortController();

    await expect(wrappedFn(controller.signal)).rejects.toThrow('Network error');
  });
});

describe('withAbortAndTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when promise resolves', async () => {
    const promise = Promise.resolve('success');
    const controller = new AbortController();

    const resultPromise = withAbortAndTimeout(promise, controller.signal, 1000);

    // Don't use fake timers for this test since the promise resolves immediately
    // and we don't want the timeout to fire
    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('rejects on abort', async () => {
    const promise = new Promise(() => {}); // Never resolves
    const controller = new AbortController();

    const resultPromise = withAbortAndTimeout(promise, controller.signal);

    act(() => {
      controller.abort();
    });

    await expect(resultPromise).rejects.toThrow('Operation aborted');
  });

  it.skip('rejects on timeout', async () => {
    const promise = new Promise(() => {}); // Never resolves
    const controller = new AbortController();

    const resultPromise = withAbortAndTimeout(promise, controller.signal, 1000);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await expect(resultPromise).rejects.toThrow('Operation timed out');
  });

  it('rejects immediately if signal is already aborted', async () => {
    const promise = Promise.resolve('success');
    const controller = new AbortController();

    controller.abort();

    const resultPromise = withAbortAndTimeout(promise, controller.signal);

    await expect(resultPromise).rejects.toThrow('Operation aborted');
  });
});
