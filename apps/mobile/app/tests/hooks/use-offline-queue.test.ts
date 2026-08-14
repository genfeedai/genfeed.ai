import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queue = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const items = [
    {
      endpoint: '/ideas',
      id: 'q-1',
      maxRetries: 3,
      method: 'POST' as const,
      retries: 0,
      timestamp: 1,
      type: 'CREATE_IDEA',
    },
  ];

  return {
    addAction: vi.fn(async () => 'q-2'),
    clearQueue: vi.fn(async () => undefined),
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },
    getQueue: vi.fn(() => [...items]),
    init: vi.fn(),
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    processQueue: vi.fn(async () => undefined),
    removeAction: vi.fn(async () => undefined),
    removeAllListeners() {
      listeners.clear();
    },
  };
});

vi.mock('@/services/offline-queue.service', () => ({
  offlineQueueService: queue,
}));

import { useOfflineQueue } from '@/hooks/use-offline-queue';

describe('useOfflineQueue', () => {
  beforeEach(() => {
    queue.removeAllListeners();
    queue.getQueue.mockReturnValue([
      {
        endpoint: '/ideas',
        id: 'q-1',
        maxRetries: 3,
        method: 'POST',
        retries: 0,
        timestamp: 1,
        type: 'CREATE_IDEA',
      },
    ]);
  });

  it('exposes queue length and wires mutations to the service', async () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(queue.init).toHaveBeenCalled();
    expect(result.current.queueLength).toBe(1);
    expect(result.current.isProcessing).toBe(false);

    await act(async () => {
      await result.current.addToQueue({
        endpoint: '/ideas',
        method: 'POST',
        type: 'CREATE_IDEA',
      });
      await result.current.processQueue();
      await result.current.removeFromQueue('q-1');
      await result.current.clearQueue();
    });

    expect(queue.addAction).toHaveBeenCalled();
    expect(queue.processQueue).toHaveBeenCalled();
    expect(queue.removeAction).toHaveBeenCalledWith('q-1');
    expect(queue.clearQueue).toHaveBeenCalled();
  });

  it('toggles processing from service events', () => {
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      queue.emit('processingStarted');
    });
    expect(result.current.isProcessing).toBe(true);

    queue.getQueue.mockReturnValue([]);
    act(() => {
      queue.emit('processingComplete');
    });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.queueLength).toBe(0);
  });
});
