import {
  isAbortError,
  useAbortController,
} from '@hooks/utils/use-abort-controller/use-abort-controller';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('isAbortError', () => {
  it('detects AbortError', () => {
    const error = new DOMException('Operation aborted', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('detects Error instances with AbortError message', () => {
    const error = new Error('AbortError');
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
