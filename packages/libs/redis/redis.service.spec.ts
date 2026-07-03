import type { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import Redis from 'ioredis';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

type RedisClientSubset = Pick<
  Redis,
  | 'connect'
  | 'duplicate'
  | 'on'
  | 'publish'
  | 'quit'
  | 'subscribe'
  | 'unsubscribe'
>;

type MockRedisClient = Mocked<RedisClientSubset> & {
  emitMessage: (channel: string, message: string) => void;
};

describe('RedisService', () => {
  let service: RedisService;

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

  const buildMockClient = (): MockRedisClient => {
    let messageHandler:
      | ((channel: string, message: string) => void)
      | undefined;

    const client: MockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
      emitMessage: (channel: string, message: string) => {
        messageHandler?.(channel, message);
      },
      on: vi.fn((event: string, handler: unknown) => {
        if (event === 'message') {
          messageHandler = handler as (
            channel: string,
            message: string,
          ) => void;
        }
        return client as unknown as Redis;
      }) as unknown as Mocked<RedisClientSubset>['on'],
      publish: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };

    return client;
  };

  const createService = () => {
    service = new RedisService(
      mockConfigService,
      mockLoggerService as unknown as LoggerService,
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfigService.get.mockReturnValue('redis://localhost:6379');
  });

  afterEach(async () => {
    await service?.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    createService();
    expect(service).toBeDefined();
  });

  it('should no-op when REDIS_URL is missing', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    createService();
    await service.onModuleInit();

    expect(vi.mocked(Redis)).not.toHaveBeenCalled();
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'REDIS_URL not configured - Redis features disabled',
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should connect publisher/subscriber and process pending subscriptions', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();

    const handler = vi.fn();
    await service.subscribe('test-channel', handler);

    await service.onModuleInit();

    expect(vi.mocked(Redis)).toHaveBeenCalledTimes(2);
    expect(publisher.connect).toHaveBeenCalledOnce();
    expect(subscriber.connect).toHaveBeenCalledOnce();
    expect(subscriber.subscribe).toHaveBeenCalledWith('test-channel');
    expect(mockLoggerService.log).toHaveBeenCalledWith(
      'Redis clients connected successfully',
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should warn and stay disabled when Redis connect fails', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    publisher.connect.mockRejectedValueOnce(new Error('publisher failed'));

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();
    await service.onModuleInit();

    await expect(
      service.publish('test-channel', { ok: true }),
    ).resolves.toBeUndefined();
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis not initialized'),
      expect.objectContaining({ service: 'RedisService' }),
    );

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis connection failed - features disabled'),
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should publish when initialized', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();
    await service.onModuleInit();

    await service.publish('test-channel', { test: 'data' });

    expect(publisher.publish).toHaveBeenCalledWith(
      'test-channel',
      JSON.stringify({ test: 'data' }),
    );
  });

  it('should no-op on publish before initialization', async () => {
    createService();

    await expect(
      service.publish('test-channel', { test: 'data' }),
    ).resolves.toBeUndefined();
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis not initialized'),
      expect.objectContaining({ service: 'RedisService' }),
    );
  });

  it('should unsubscribe and clear handlers', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();
    await service.onModuleInit();

    const handler = vi.fn();
    await service.subscribe('test-channel', handler);

    await service.unsubscribe('test-channel');

    subscriber.emitMessage('test-channel', JSON.stringify({ value: 1 }));

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('test-channel');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should emit message event with raw payload', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();
    await service.onModuleInit();

    const eventSpy = vi.fn();
    service.on('message', eventSpy);

    await service.subscribe('test-channel');

    const payload = JSON.stringify({ hello: 'world' });
    subscriber.emitMessage('test-channel', payload);

    expect(eventSpy).toHaveBeenCalledWith('test-channel', payload);
  });

  it('should retry Redis subscription after a failed subscribe attempt', async () => {
    const publisher = buildMockClient();
    const subscriber = buildMockClient();
    subscriber.subscribe
      .mockRejectedValueOnce(new Error('subscribe timeout'))
      .mockResolvedValueOnce(undefined);

    vi.mocked(Redis)
      .mockImplementationOnce(() => publisher as unknown as Redis)
      .mockImplementationOnce(() => subscriber as unknown as Redis);

    createService();
    await service.onModuleInit();

    await expect(service.subscribe('flaky-channel', vi.fn())).rejects.toThrow(
      'subscribe timeout',
    );

    const handler = vi.fn();
    await service.subscribe('flaky-channel', handler);

    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);

    subscriber.emitMessage('flaky-channel', JSON.stringify({ retried: true }));

    expect(handler).toHaveBeenCalledWith({ retried: true });
  });
});
