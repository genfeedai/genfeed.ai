import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

const network = vi.hoisted(() => ({
  isOnline: vi.fn(() => false),
  on: vi.fn(),
}));

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorage,
}));

vi.mock('@/services/network.service', () => ({
  networkService: network,
}));

vi.mock('@/services/sentry.service', () => ({
  sentryService: sentry,
}));

import { offlineQueueService } from '@/services/offline-queue.service';

describe('offlineQueueService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    network.isOnline.mockReturnValue(false);
    asyncStorage.getItem.mockResolvedValue(null);
    asyncStorage.setItem.mockResolvedValue(undefined);
    await offlineQueueService.clearQueue();
  });

  it('persists queued actions while offline and exposes a copy', async () => {
    const queued = vi.fn();
    offlineQueueService.on('actionQueued', queued);

    const id = await offlineQueueService.addAction({
      endpoint: '/ideas',
      method: 'POST',
      payload: { text: 'Ship it' },
      type: 'CREATE_IDEA',
    });

    expect(id.length).toBeGreaterThan(0);
    expect(offlineQueueService.getQueueLength()).toBe(1);
    expect(offlineQueueService.isQueueEmpty()).toBe(false);
    expect(offlineQueueService.getQueue()[0]).toMatchObject({
      endpoint: '/ideas',
      method: 'POST',
      payload: { text: 'Ship it' },
      retries: 0,
      type: 'CREATE_IDEA',
    });
    expect(queued).toHaveBeenCalledTimes(1);
    expect(asyncStorage.setItem).toHaveBeenCalled();
  });

  it('processes successful actions and drops exhausted failures', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    network.isOnline.mockReturnValue(false);

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await offlineQueueService.addAction({
      endpoint: '/ideas/ok',
      maxRetries: 1,
      method: 'POST',
      type: 'CREATE_IDEA',
    });
    await offlineQueueService.addAction({
      endpoint: '/ideas/fail',
      maxRetries: 1,
      method: 'POST',
      type: 'CREATE_IDEA',
    });

    network.isOnline.mockReturnValue(true);
    await offlineQueueService.processQueue();

    expect(offlineQueueService.isQueueEmpty()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Request failed with status 500',
      }),
      expect.objectContaining({
        actionType: 'CREATE_IDEA',
        method: 'POST',
      }),
    );
    vi.unstubAllGlobals();
  });

  it('removes a single action without clearing the rest', async () => {
    const first = await offlineQueueService.addAction({
      endpoint: '/ideas/1',
      method: 'POST',
      type: 'CREATE_IDEA',
    });
    await offlineQueueService.addAction({
      endpoint: '/ideas/2',
      method: 'POST',
      type: 'CREATE_IDEA',
    });

    await offlineQueueService.removeAction(first);

    expect(offlineQueueService.getQueue().map((item) => item.endpoint)).toEqual(
      ['/ideas/2'],
    );
  });

  it('rejects queue mutations when persistence fails', async () => {
    const storageError = new Error('Storage unavailable');
    asyncStorage.setItem.mockRejectedValueOnce(storageError);

    await expect(
      offlineQueueService.addAction({
        endpoint: '/ideas',
        method: 'POST',
        type: 'CREATE_IDEA',
      }),
    ).rejects.toBe(storageError);
  });

  it('finishes processing when the updated queue cannot be persisted', async () => {
    const processingComplete = vi.fn();
    const storageError = new Error('Storage unavailable');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    await offlineQueueService.addAction({
      endpoint: '/ideas',
      method: 'POST',
      type: 'CREATE_IDEA',
    });
    network.isOnline.mockReturnValue(true);
    asyncStorage.setItem.mockRejectedValueOnce(storageError);
    offlineQueueService.on('processingComplete', processingComplete);

    await expect(offlineQueueService.processQueue()).rejects.toBe(storageError);

    expect(processingComplete).toHaveBeenCalledWith({
      processed: 1,
      remaining: 0,
    });
    vi.unstubAllGlobals();
  });
});
