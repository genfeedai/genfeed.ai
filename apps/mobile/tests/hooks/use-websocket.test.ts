import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appState = vi.hoisted(() => ({
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  currentState: 'active',
}));

const socket = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getConnectionState: vi.fn(() => 'disconnected' as const),
  off: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
}));

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('react-native', () => ({ AppState: appState }));

vi.mock('@/services/websocket.service', () => ({
  websocketService: socket,
}));

vi.mock('@/services/sentry.service', () => ({
  sentryService: sentry,
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { useWebSocket } from '@/hooks/use-websocket';

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects with the current authentication token', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isSignedIn: true,
    } as unknown as ReturnType<typeof useMobileAuth>);

    renderHook(() => useWebSocket());

    await waitFor(() => {
      expect(socket.connect).toHaveBeenCalledWith('test-token');
    });
  });

  it('reports authentication token failures', async () => {
    const tokenError = new Error('Token unavailable');
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockRejectedValue(tokenError),
      isSignedIn: true,
    } as unknown as ReturnType<typeof useMobileAuth>);

    renderHook(() => useWebSocket());

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledWith(tokenError, {
        operation: 'getWebSocketToken',
      });
    });
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
