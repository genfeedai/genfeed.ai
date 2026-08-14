import { beforeEach, describe, expect, it, vi } from 'vitest';

const netInfo = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: netInfo,
}));

import { networkService } from '@/services/network.service';

describe('networkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    netInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
  });

  it('reports unknown until init, then tracks NetInfo transitions', async () => {
    expect(networkService.getStatus()).toBe('unknown');
    expect(networkService.isOnline()).toBe(true);

    const connectionChanged = vi.fn();
    const online = vi.fn();
    const offline = vi.fn();
    networkService.on('connectionChanged', connectionChanged);
    networkService.on('online', online);
    networkService.on('offline', offline);

    await networkService.init();
    await networkService.init();

    expect(networkService.getStatus()).toBe('online');
    expect(networkService.getNetworkType()).toBe('wifi');
    expect(netInfo.addEventListener).toHaveBeenCalledTimes(1);

    const listener = netInfo.addEventListener.mock.calls[0]?.[0] as (state: {
      isConnected: boolean | null;
      type: string;
    }) => void;

    listener({ isConnected: false, type: 'none' });
    expect(networkService.isOnline()).toBe(false);
    expect(networkService.getStatus()).toBe('offline');
    expect(connectionChanged).toHaveBeenCalledWith(false);
    expect(offline).toHaveBeenCalledTimes(1);

    listener({ isConnected: true, type: 'cellular' });
    expect(networkService.getNetworkType()).toBe('cellular');
    expect(online).toHaveBeenCalledTimes(1);
  });

  it('treats a null NetInfo connection as offline', async () => {
    netInfo.fetch.mockResolvedValue({ isConnected: null, type: 'unknown' });

    await expect(networkService.checkConnection()).resolves.toBe(false);
  });
});
