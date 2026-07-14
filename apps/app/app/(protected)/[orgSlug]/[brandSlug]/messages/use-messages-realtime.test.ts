import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessagesRealtime } from './use-messages-realtime';

const mocks = vi.hoisted(() => ({
  connectionState: 'connected' as
    | 'connected'
    | 'connecting'
    | 'offline'
    | 'reconnecting',
  eventHandler: null as null | (() => void),
  isReady: true,
  subscribe: vi.fn((_path: string, handler: () => void) => {
    mocks.eventHandler = handler;
    return vi.fn();
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: mocks.connectionState,
    isReady: mocks.isReady,
    subscribe: mocks.subscribe,
  }),
}));

vi.mock('./messages-surface-telemetry', () => ({
  captureMessagesSurfaceEvent: vi.fn(),
}));

describe('useMessagesRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.connectionState = 'connected';
    mocks.eventHandler = null;
    mocks.isReady = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the scoped inbox and debounces realtime refreshes', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useMessagesRealtime({ onRefresh, organizationId: 'organization-1' }),
    );

    expect(mocks.subscribe).toHaveBeenCalledWith(
      '/social-inbox/organization-1',
      expect.any(Function),
    );
    act(() => {
      mocks.eventHandler?.();
      mocks.eventHandler?.();
      vi.advanceTimersByTime(250);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes after an offline connection reconnects', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(() =>
      useMessagesRealtime({ onRefresh, organizationId: 'organization-1' }),
    );

    mocks.connectionState = 'offline';
    rerender();
    mocks.connectionState = 'connected';
    rerender();

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
