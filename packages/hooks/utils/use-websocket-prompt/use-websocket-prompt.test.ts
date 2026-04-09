import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
    })),
  },
}));

vi.mock('@genfeedai/services/core/socket-manager.service', () => ({
  createPromptHandler: vi.fn(
    (
      _onSuccess: (result: unknown) => void,
      _onError: (error: string) => void,
    ) => vi.fn(),
  ),
}));

vi.mock('@genfeedai/utils/network/websocket.util', () => ({
  WebSocketPaths: {
    prompt: vi.fn((id: string) => `prompt:${id}`),
  },
}));

describe('useWebsocketPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function to listen for websocket responses', () => {
    const mockOnSuccess = vi.fn();
    const { result } = renderHook(() =>
      useWebsocketPrompt({ onSuccess: mockOnSuccess }),
    );

    expect(typeof result.current).toBe('function');
  });

  it('accepts options for callbacks and timeout', () => {
    const mockOnSuccess = vi.fn();
    const mockOnError = vi.fn();
    const mockOnTimeout = vi.fn();

    const { result } = renderHook(() =>
      useWebsocketPrompt({
        onError: mockOnError,
        onSuccess: mockOnSuccess,
        onTimeout: mockOnTimeout,
        timeoutMs: 5000,
      }),
    );

    expect(typeof result.current).toBe('function');
  });
});
