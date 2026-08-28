import {
  useSocketManager,
  useSocketSubscriptions,
} from '@hooks/utils/use-socket-manager/use-socket-manager';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.fn().mockResolvedValue('mock-token');
const resolveAuthTokenMock = vi.fn().mockResolvedValue('mock-token');
const useAuthIdentityMock = vi.fn();
const socketManagerGetInstanceMock = vi.fn(() => ({
  cleanup: vi.fn(),
  connect: vi.fn(),
  getConnectionState: vi.fn(() => 'connected'),
  getListenersCount: vi.fn(() => 0),
  isConnected: vi.fn(() => false),
  subscribe: vi.fn(() => vi.fn()),
  subscribeConnectionState: vi.fn((handler: (state: string) => void) => {
    handler('connected');
    return vi.fn();
  }),
  unsubscribe: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthIdentityMock(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@genfeedai/services/core/socket-manager.service', () => ({
  SocketManager: {
    getInstance: (...args: unknown[]) => socketManagerGetInstanceMock(...args),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('useSocketManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue('mock-token');
    resolveAuthTokenMock.mockResolvedValue('mock-token');
    useAuthIdentityMock.mockReturnValue({
      getToken: getTokenMock,
      isLoaded: true,
      isSignedIn: true,
    });
  });

  it('returns socket manager interface', () => {
    const { result } = renderHook(() => useSocketManager());

    expect(result.current).toHaveProperty('subscribe');
    expect(result.current).toHaveProperty('unsubscribe');
    expect(result.current).toHaveProperty('isConnected');
    expect(result.current).toHaveProperty('isReady');
    expect(result.current).toHaveProperty('cleanup');
    expect(result.current).toHaveProperty('connect');
    expect(result.current).toHaveProperty('connectionState');
  });

  it('provides socket connection methods', () => {
    const { result } = renderHook(() => useSocketManager());

    expect(typeof result.current.subscribe).toBe('function');
    expect(typeof result.current.unsubscribe).toBe('function');
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.cleanup).toBe('function');
  });

  it('uses the standard session token path for websocket auth', async () => {
    renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(resolveAuthTokenMock).toHaveBeenCalledWith(getTokenMock);
    });

    expect(socketManagerGetInstanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resolveToken: expect.any(Function),
        token: 'mock-token',
      }),
    );

    const config = socketManagerGetInstanceMock.mock.calls[0]?.[0] as {
      resolveToken: () => Promise<string | null>;
    };
    await config.resolveToken();
    expect(resolveAuthTokenMock).toHaveBeenLastCalledWith(getTokenMock, {
      forceRefresh: true,
    });
  });

  it('stays offline until auth is loaded and signed in', async () => {
    useAuthIdentityMock.mockReturnValue({
      getToken: getTokenMock,
      isLoaded: false,
      isSignedIn: false,
    });

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });

    expect(result.current.isReady).toBe(false);
    expect(resolveAuthTokenMock).not.toHaveBeenCalled();
    expect(socketManagerGetInstanceMock).not.toHaveBeenCalled();
  });

  it('does not connect when token resolution returns null', async () => {
    resolveAuthTokenMock.mockResolvedValue(null);

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });

    expect(result.current.isReady).toBe(false);
    expect(socketManagerGetInstanceMock).not.toHaveBeenCalled();
  });

  it('goes offline when token resolution throws', async () => {
    resolveAuthTokenMock.mockRejectedValue(new Error('auth backend down'));

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });

    expect(result.current.isReady).toBe(false);
  });

  it('delegates socket operations to the singleton once ready', async () => {
    const instance = {
      cleanup: vi.fn(),
      connect: vi.fn(),
      getConnectionState: vi.fn(() => 'connected'),
      getListenersCount: vi.fn(() => 3),
      isConnected: vi.fn(() => true),
      subscribe: vi.fn(() => vi.fn()),
      subscribeConnectionState: vi.fn(() => vi.fn()),
      unsubscribe: vi.fn(),
    };
    socketManagerGetInstanceMock.mockReturnValue(instance);

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    const handler = vi.fn();
    result.current.subscribe('event-a', handler);
    expect(instance.subscribe).toHaveBeenCalledWith('event-a', handler);

    result.current.unsubscribe('event-a', handler);
    expect(instance.unsubscribe).toHaveBeenCalledWith('event-a', handler);

    result.current.connect();
    expect(instance.connect).toHaveBeenCalled();

    result.current.cleanup();
    expect(instance.cleanup).toHaveBeenCalled();

    expect(result.current.isConnected()).toBe(true);
    expect(result.current.getListenersCount()).toBe(3);
    expect(result.current.getSocketManager()).toBe(instance);
  });

  it('returns safe no-op values before the socket is initialized', () => {
    useAuthIdentityMock.mockReturnValue({
      getToken: getTokenMock,
      isLoaded: false,
      isSignedIn: false,
    });

    const { result } = renderHook(() => useSocketManager());

    const dispose = result.current.subscribe('event', vi.fn());
    expect(typeof dispose).toBe('function');
    expect(dispose()).toBeUndefined();
    expect(result.current.isConnected()).toBe(false);
    expect(result.current.getListenersCount()).toBe(0);
    expect(result.current.getSocketManager()).toBeNull();
    expect(() => {
      result.current.unsubscribe('event');
      result.current.cleanup();
      result.current.connect();
    }).not.toThrow();
  });
});

describe('useSocketSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthTokenMock.mockResolvedValue('mock-token');
    useAuthIdentityMock.mockReturnValue({
      getToken: getTokenMock,
      isLoaded: true,
      isSignedIn: true,
    });
  });

  it('subscribes a single event passed as a one-item list', async () => {
    const dispose = vi.fn();
    const instance = {
      cleanup: vi.fn(),
      connect: vi.fn(),
      getConnectionState: vi.fn(() => 'connected'),
      getListenersCount: vi.fn(() => 0),
      isConnected: vi.fn(() => true),
      subscribe: vi.fn(() => dispose),
      subscribeConnectionState: vi.fn(() => vi.fn()),
      unsubscribe: vi.fn(),
    };
    socketManagerGetInstanceMock.mockReturnValue(instance);

    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useSocketSubscriptions([{ event: 'my-event', handler }]),
    );

    await waitFor(() => {
      expect(instance.subscribe).toHaveBeenCalledWith('my-event', handler);
    });

    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  it('subscribes to all events and disposes each on unmount', async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const instance = {
      cleanup: vi.fn(),
      connect: vi.fn(),
      getConnectionState: vi.fn(() => 'connected'),
      getListenersCount: vi.fn(() => 0),
      isConnected: vi.fn(() => true),
      subscribe: vi
        .fn()
        .mockReturnValueOnce(disposeA)
        .mockReturnValueOnce(disposeB),
      subscribeConnectionState: vi.fn(() => vi.fn()),
      unsubscribe: vi.fn(),
    };
    socketManagerGetInstanceMock.mockReturnValue(instance);

    const subscriptions = [
      { event: 'event-a', handler: vi.fn() },
      { event: 'event-b', handler: vi.fn() },
    ];
    const { unmount } = renderHook(() => useSocketSubscriptions(subscriptions));

    await waitFor(() => {
      expect(instance.subscribe).toHaveBeenCalledWith(
        'event-a',
        subscriptions[0].handler,
      );
      expect(instance.subscribe).toHaveBeenCalledWith(
        'event-b',
        subscriptions[1].handler,
      );
    });

    unmount();
    expect(disposeA).toHaveBeenCalled();
    expect(disposeB).toHaveBeenCalled();
  });

  it('does nothing with an empty subscription list', async () => {
    const instance = {
      cleanup: vi.fn(),
      connect: vi.fn(),
      getConnectionState: vi.fn(() => 'connected'),
      getListenersCount: vi.fn(() => 0),
      isConnected: vi.fn(() => true),
      subscribe: vi.fn(() => vi.fn()),
      subscribeConnectionState: vi.fn(() => vi.fn()),
      unsubscribe: vi.fn(),
    };
    socketManagerGetInstanceMock.mockReturnValue(instance);

    const { result } = renderHook(() => useSocketSubscriptions([]));

    await waitFor(() => {
      expect(result.current.getSocketManager()).toBe(instance);
    });

    expect(instance.subscribe).not.toHaveBeenCalled();
  });
});
