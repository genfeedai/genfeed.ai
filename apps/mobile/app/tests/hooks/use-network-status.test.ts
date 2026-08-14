import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const network = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },
    getNetworkType: vi.fn(() => 'wifi'),
    getStatus: vi.fn(() => 'online' as const),
    init: vi.fn(),
    isOnline: vi.fn(() => true),
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    removeAllListeners() {
      listeners.clear();
    },
  };
});

vi.mock('@/services/network.service', () => ({
  networkService: network,
}));

import { useNetworkStatus } from '@/hooks/use-network-status';

describe('useNetworkStatus', () => {
  beforeEach(() => {
    network.removeAllListeners();
    network.getNetworkType.mockReturnValue('wifi');
    network.getStatus.mockReturnValue('online');
    network.isOnline.mockReturnValue(true);
  });

  it('hydrates from the service and updates on connectionChanged', () => {
    const { result, unmount } = renderHook(() => useNetworkStatus());

    expect(network.init).toHaveBeenCalled();
    expect(result.current).toEqual({
      isOnline: true,
      networkType: 'wifi',
      status: 'online',
    });

    network.getNetworkType.mockReturnValue('none');
    act(() => {
      network.emit('connectionChanged', false);
    });

    expect(result.current).toEqual({
      isOnline: false,
      networkType: 'none',
      status: 'offline',
    });

    unmount();
    expect(network.listenerCount('connectionChanged')).toBe(0);
  });
});
