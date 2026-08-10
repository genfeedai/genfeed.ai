import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOCKET_CONNECTION_UI_GRACE_MS,
  useStableSocketConnectionState,
} from './use-stable-socket-connection-state';

describe('useStableSocketConnectionState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces connected immediately', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStableSocketConnectionState(state, 1_000),
      { initialProps: { state: 'reconnecting' as const } },
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe('reconnecting');

    rerender({ state: 'connected' });
    expect(result.current).toBe('connected');
  });

  it('suppresses brief reconnect flashes under the grace window', () => {
    const { result, rerender } = renderHook(
      ({ state }) =>
        useStableSocketConnectionState(state, SOCKET_CONNECTION_UI_GRACE_MS),
      { initialProps: { state: 'connected' as const } },
    );

    rerender({ state: 'reconnecting' });
    expect(result.current).toBe('connected');

    act(() => {
      vi.advanceTimersByTime(SOCKET_CONNECTION_UI_GRACE_MS - 1);
    });
    expect(result.current).toBe('connected');

    // Recovery before the grace expires — never show reconnect chrome.
    rerender({ state: 'connected' });
    act(() => {
      vi.advanceTimersByTime(SOCKET_CONNECTION_UI_GRACE_MS);
    });
    expect(result.current).toBe('connected');
  });

  it('shows reconnect only after a sustained outage', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStableSocketConnectionState(state, 500),
      { initialProps: { state: 'connected' as const } },
    );

    rerender({ state: 'reconnecting' });
    expect(result.current).toBe('connected');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('reconnecting');
  });
});
