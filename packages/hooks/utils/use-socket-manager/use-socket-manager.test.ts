import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.fn().mockResolvedValue('mock-token');
const resolveClerkTokenMock = vi.fn().mockResolvedValue('mock-token');
const useAuthMock = vi.fn();
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
  subscribeMultiple: vi.fn(() => []),
  unsubscribe: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
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
    resolveClerkTokenMock.mockResolvedValue('mock-token');
    useAuthMock.mockReturnValue({
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
      expect(resolveClerkTokenMock).toHaveBeenCalledWith(getTokenMock);
    });

    expect(socketManagerGetInstanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'mock-token',
      }),
    );
  });

  it('stays offline until auth is loaded and signed in', async () => {
    useAuthMock.mockReturnValue({
      getToken: getTokenMock,
      isLoaded: false,
      isSignedIn: false,
    });

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });

    expect(result.current.isReady).toBe(false);
    expect(resolveClerkTokenMock).not.toHaveBeenCalled();
    expect(socketManagerGetInstanceMock).not.toHaveBeenCalled();
  });

  it('does not connect when token resolution returns null', async () => {
    resolveClerkTokenMock.mockResolvedValue(null);

    const { result } = renderHook(() => useSocketManager());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });

    expect(result.current.isReady).toBe(false);
    expect(socketManagerGetInstanceMock).not.toHaveBeenCalled();
  });
});
