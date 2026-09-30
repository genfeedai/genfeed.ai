import type { LoggerService } from '@libs/logger/logger.service';
import { InProcessRedisService } from '@libs/redis/in-process-redis.service';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

describe('InProcessRedisService', () => {
  let service: InProcessRedisService;

  const mockConfigService = {
    get: vi.fn<(key: string) => string | undefined>(),
  };

  const mockLoggerService: Mocked<
    Pick<LoggerService, 'debug' | 'error' | 'log' | 'warn'>
  > = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InProcessRedisService(
      mockConfigService,
      mockLoggerService as unknown as LoggerService,
    );
  });

  it('logs the in-process driver on init without connecting anywhere', async () => {
    await service.onModuleInit();

    expect(mockLoggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('Redis driver "in-process"'),
      expect.objectContaining({ service: 'InProcessRedisService' }),
    );
  });

  it('delivers published messages to subscribed handlers', async () => {
    const handler = vi.fn();
    await service.subscribe('channel-a', handler);

    await service.publish('channel-a', { value: 1 });

    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('emits the raw JSON payload for message listeners', async () => {
    const listener = vi.fn();
    service.on('message', listener);

    await service.publish('channel-a', { value: 2 });

    expect(listener).toHaveBeenCalledWith(
      'channel-a',
      JSON.stringify({ value: 2 }),
    );
  });

  it('keeps delivering when one subscriber throws', async () => {
    const failing = vi.fn(() => {
      throw new Error('subscriber exploded');
    });
    const healthy = vi.fn();
    await service.subscribe('channel-a', failing);
    await service.subscribe('channel-a', healthy);

    await service.publish('channel-a', { value: 3 });

    expect(failing).toHaveBeenCalledOnce();
    expect(healthy).toHaveBeenCalledWith({ value: 3 });
    expect(mockLoggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('In-process subscriber for channel-a threw'),
      expect.any(Error),
      expect.objectContaining({ service: 'InProcessRedisService' }),
    );
  });

  it('supports subscribing without a handler', async () => {
    await expect(service.subscribe('channel-b')).resolves.toBeUndefined();
    await expect(
      service.publish('channel-b', { value: 4 }),
    ).resolves.toBeUndefined();
  });

  it('stops delivery after unsubscribe', async () => {
    const handler = vi.fn();
    await service.subscribe('channel-a', handler);
    await service.unsubscribe('channel-a');

    await service.publish('channel-a', { value: 5 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('clears handlers on module destroy', async () => {
    const handler = vi.fn();
    await service.subscribe('channel-a', handler);

    await service.onModuleDestroy();
    await service.publish('channel-a', { value: 6 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('never exposes a raw redis client', () => {
    expect(service.getPublisher()).toBeNull();
  });
});
