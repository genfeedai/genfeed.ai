import { IngredientCategory } from '@genfeedai/enums';
import { useGenerationListener } from '@hooks/utils/use-generation-listener/use-generation-listener';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeMock = vi.fn();
const createMediaHandlerMock = vi.fn();

const mockNotifications = {
  error: vi.fn(),
};

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: subscribeMock,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mockNotifications,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: (...args: unknown[]) => createMediaHandlerMock(...args),
}));

describe('useGenerationListener', () => {
  const subscriptions: Array<{
    event: string;
    handler: (payload: unknown) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.length = 0;

    createMediaHandlerMock.mockImplementation(
      (
        onSuccess: (result: unknown) => void,
        onError?: (error: string) => void,
      ) =>
        (payload: { type?: 'error'; result?: string; error?: string }) => {
          if (payload?.type === 'error') {
            onError?.(payload.error ?? 'Generation failed');
          } else {
            onSuccess(payload?.result ?? payload);
          }
        },
    );

    subscribeMock.mockImplementation(
      (event: string, handler: (payload: unknown) => void) => {
        const unsubscribe = vi.fn();
        subscriptions.push({ event, handler, unsubscribe });
        return unsubscribe;
      },
    );
  });

  it('subscribes to each pending id and cleans up', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useGenerationListener({ onSuccess }));

    const cleanup = result.current(
      ['pending-1', 'pending-2'],
      IngredientCategory.IMAGE,
    );

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscriptions[0].event).toBe('/images/pending-1');
    expect(subscriptions[1].event).toBe('/images/pending-2');

    cleanup();

    expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
    expect(subscriptions[1].unsubscribe).toHaveBeenCalled();
  });

  it('calls onSuccess and onBatchComplete for completed batch', () => {
    const onSuccess = vi.fn();
    const onBatchComplete = vi.fn();
    const { result } = renderHook(() =>
      useGenerationListener({ onBatchComplete, onSuccess }),
    );

    result.current(['pending-1', 'pending-2'], IngredientCategory.IMAGE);

    subscriptions[0].handler({ result: 'resolved-1' });
    subscriptions[1].handler({ result: 'resolved-2' });

    expect(onSuccess).toHaveBeenCalledWith('resolved-1', 0);
    expect(onSuccess).toHaveBeenCalledWith('resolved-2', 1);
    expect(onBatchComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onError and shows notifications when generation fails', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useGenerationListener({
        errorMessage: 'Custom error',
        onError,
        onSuccess,
      }),
    );

    result.current(['pending-1'], IngredientCategory.IMAGE);
    subscriptions[0].handler({ error: 'Failed', type: 'error' });

    expect(onError).toHaveBeenCalledWith('Failed', 0);
    expect(mockNotifications.error).toHaveBeenCalledWith('Failed');
  });

  it('handles timeouts and triggers timeout callback', () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useGenerationListener({
        onSuccess,
        onTimeout,
        timeoutMessage: 'Timed out',
        timeoutMs: 5000,
      }),
    );

    result.current(['pending-1'], IngredientCategory.IMAGE);

    vi.advanceTimersByTime(5000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(mockNotifications.error).toHaveBeenCalledWith('Timed out');
    vi.useRealTimers();
  });
});
