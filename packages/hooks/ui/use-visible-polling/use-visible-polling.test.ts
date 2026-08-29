import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisiblePolling } from './use-visible-polling';

function setDocumentHidden(isHidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => isHidden,
  });
}

function hideDocument(): void {
  setDocumentHidden(true);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function showDocument(): void {
  setDocumentHidden(false);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('useVisiblePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setDocumentHidden(false);
    vi.restoreAllMocks();
  });

  it('polls on the interval while the document is visible', () => {
    const poll = vi.fn();

    renderHook(() => useVisiblePolling(poll, { intervalMs: 1000 }));

    expect(poll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('stops polling while the document is hidden', () => {
    const poll = vi.fn();

    renderHook(() => useVisiblePolling(poll, { intervalMs: 1000 }));

    hideDocument();
    poll.mockClear();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(poll).not.toHaveBeenCalled();
  });

  it('catches up immediately when the document becomes visible again', () => {
    const poll = vi.fn();

    renderHook(() => useVisiblePolling(poll, { intervalMs: 1000 }));

    hideDocument();
    poll.mockClear();

    showDocument();

    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('does not poll on mount when the document was never hidden', () => {
    const poll = vi.fn();

    renderHook(() => useVisiblePolling(poll, { intervalMs: 1000 }));

    expect(poll).not.toHaveBeenCalled();
  });

  it('suspends polling while disabled', () => {
    const poll = vi.fn();

    const { rerender } = renderHook(
      ({ isEnabled }: { isEnabled: boolean }) =>
        useVisiblePolling(poll, { intervalMs: 1000, isEnabled }),
      { initialProps: { isEnabled: false } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(poll).not.toHaveBeenCalled();

    rerender({ isEnabled: true });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('keeps the timer running when the callback identity changes', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ poll }: { poll: () => void }) =>
        useVisiblePolling(poll, { intervalMs: 1000 }),
      { initialProps: { poll: first } },
    );

    act(() => {
      vi.advanceTimersByTime(900);
    });

    rerender({ poll: second });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clears the interval on unmount', () => {
    const poll = vi.fn();

    const { unmount } = renderHook(() =>
      useVisiblePolling(poll, { intervalMs: 1000 }),
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(poll).not.toHaveBeenCalled();
  });
});
