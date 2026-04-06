import type { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import type { RedisClientType } from 'redis';
import * as redis from 'redis';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';

type RedisClientSubset = Pick<
  RedisClientType,
  | 'connect'
  | 'duplicate'
  | 'on'
  | 'publish'
  | 'quit'
  | 'subscribe'
  | 'unsubscribe'
>;

describe('RedisService', () => {
  let service: RedisService;
  let createClientSpy: ReturnType<typeof vi.spyOn>;

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

  const buildMockClient = (): Mocked<RedisClientSubset> => {
    const client: RedisClientSubset = {
      connect: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
      on: vi.fn(),
      publish: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };

    return client as Mocked<RedisClientSubset>;
  };

  const createService = () => {
    service = new RedisService(
      mockConfigService,
      mockLoggerService as unknown as LoggerService,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService.get.mockReturnValue('redis://localhost:6379');
  });

  afterEach(async () => {
    await service?.onModuleDestroy();
    createClientSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    createService();
    expect(service).toBeDefined();
  });

  it('should no-op when REDIS_URL is missing', async () => {
    mockConfigService.get.mockReturnValue(undefined);
    createClientSpy = vi.spyOn(redis, 'createClient');

    createService();
    await service.onModuleInit();

    expect(createClientSpy).not.toHaveBeenCalled();
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'REDIS_URL not configured - Redis features disabled',
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should connect publisher/subscriber and process pending subscriptions', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    createClientSpy = vi
      .spyOn(redis, 'createClient')
      .mockReturnValueOnce(publisher as unknown as RedisClientType)
      .mockReturnValueOnce(subscriber as unknown as RedisClientType);

    createService();

    const handler = vi.fn();
    await service.subscribe('test-channel', handler);

    await service.onModuleInit();

    expect(createClientSpy).toHaveBeenCalledTimes(2);
    expect(publisher.connect).toHaveBeenCalledOnce();
    expect(subscriber.connect).toHaveBeenCalledOnce();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      'test-channel',
      expect.any(Function),
    );
    expect(mockLoggerService.log).toHaveBeenCalledWith(
      'Redis clients connected successfully',
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should warn and stay disabled when Redis connect fails', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    publisher.connect.mockRejectedValueOnce(new Error('publisher failed'));

    createClientSpy = vi
      .spyOn(redis, 'createClient')
      .mockReturnValueOnce(publisher as unknown as RedisClientType)
      .mockReturnValueOnce(subscriber as unknown as RedisClientType);

    createService();
    await service.onModuleInit();

    await expect(service.publish('test-channel', { ok: true })).rejects.toThrow(
      'Redis service not initialized',
    );

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis connection failed - features disabled'),
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should publish when initialized', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    createClientSpy = vi
      .spyOn(redis, 'createClient')
      .mockReturnValueOnce(publisher as unknown as RedisClientType)
      .mockReturnValueOnce(subscriber as unknown as RedisClientType);

    createService();
    await service.onModuleInit();

    await service.publish('test-channel', { test: 'data' });

    expect(publisher.publish).toHaveBeenCalledWith(
      'test-channel',
      JSON.stringify({ test: 'data' }),
    );
  });

  it('should throw on publish before initialization', async () => {
    createService();

    await expect(
      service.publish('test-channel', { test: 'data' }),
    ).rejects.toThrow('Redis service not initialized');
  });

  it('should unsubscribe and clear handlers', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    createClientSpy = vi
      .spyOn(redis, 'createClient')
      .mockReturnValueOnce(publisher as unknown as RedisClientType)
      .mockReturnValueOnce(subscriber as unknown as RedisClientType);

    createService();
    await service.onModuleInit();

    const handler = vi.fn();
    await service.subscribe('test-channel', handler);

    const subscribeCall = subscriber.subscribe.mock.calls[0];
    const callback = subscribeCall?.[1] as
      | ((payload: string) => void)
      | undefined;

    await service.unsubscribe('test-channel');

    callback?.(JSON.stringify({ value: 1 }));

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('test-channel');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should emit message event with raw payload', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    createClientSpy = vi
      .spyOn(redis, 'createClient')
      .mockReturnValueOnce(publisher as unknown as RedisClientType)
      .mockReturnValueOnce(subscriber as unknown as RedisClientType);

    createService();
    await service.onModuleInit();

    const eventSpy = vi.fn();
    service.on('message', eventSpy);

    await service.subscribe('test-channel');
    const callback = subscriber.subscribe.mock.calls[0]?.[1] as
      | ((payload: string) => void)
      | undefined;

    const payload = JSON.stringify({ hello: 'world' });
    callback?.(payload);

    expect(eventSpy).toHaveBeenCalledWith('test-channel', payload);
  });
});
