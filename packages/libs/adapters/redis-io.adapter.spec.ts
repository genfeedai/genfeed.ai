import { createServer } from 'node:http';
import { RedisIoAdapter } from '@libs/adapters/redis-io.adapter';
import type { LoggerService } from '@libs/logger/logger.service';
import * as redisAdapter from '@socket.io/redis-adapter';
import type { RedisClientType } from 'redis';
import * as redis from 'redis';
import { Server } from 'socket.io';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';

type RedisClientSubset = Pick<RedisClientType, 'connect' | 'duplicate'>;

describe('RedisIoAdapter', () => {
  const redisUrl = 'redis://localhost:6379';

  const loggerService: Mocked<Pick<LoggerService, 'error' | 'log' | 'warn'>> = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const buildMockClient = (): Mocked<RedisClientSubset> => {
    const client: RedisClientSubset = {
      connect: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
    };

    return client as Mocked<RedisClientSubset>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    const adapter = new RedisIoAdapter(undefined, redisUrl, loggerService);
    expect(adapter).toBeDefined();
  });

  it('should connect to Redis and initialize adapter constructor', async () => {
    const pubClient = buildMockClient();
    const subClient = buildMockClient();
    const adapterConstructor = Symbol('adapter-constructor');

    pubClient.duplicate.mockReturnValue(
      subClient as unknown as RedisClientType,
    );

    vi.spyOn(redis, 'createClient').mockReturnValue(
      pubClient as unknown as RedisClientType,
    );
    vi.spyOn(redisAdapter, 'createAdapter').mockReturnValue(
      adapterConstructor as unknown as ReturnType<
        typeof redisAdapter.createAdapter
      >,
    );

    const adapter = new RedisIoAdapter(undefined, redisUrl, loggerService);
    await adapter.connectToRedis();

    expect(pubClient.connect).toHaveBeenCalledOnce();
    expect(subClient.connect).toHaveBeenCalledOnce();
    expect(loggerService.log).toHaveBeenCalledWith('Redis adapter connected', {
      service: 'RedisIoAdapter',
    });
  });

  it('should log errors when Redis connection fails', async () => {
    const pubClient = buildMockClient();
    const subClient = buildMockClient();

    pubClient.duplicate.mockReturnValue(
      subClient as unknown as RedisClientType,
    );
    pubClient.connect.mockRejectedValueOnce(new Error('connection failed'));

    vi.spyOn(redis, 'createClient').mockReturnValue(
      pubClient as unknown as RedisClientType,
    );

    const adapter = new RedisIoAdapter(undefined, redisUrl, loggerService);
    await adapter.connectToRedis();

    expect(loggerService.error).toHaveBeenCalledWith(
      'RedisIoAdapter connectToRedis failed',
      expect.any(Error),
    );
  });

  it('should create socket server in attach mode with HTTP server', () => {
    const appRef = {
      getHttpServer: () => createServer(),
    };

    const adapter = new RedisIoAdapter(
      appRef as unknown as never,
      redisUrl,
      loggerService,
    );

    const server = adapter.createIOServer(0);

    expect(server).toBeInstanceOf(Server);
    expect(loggerService.log).toHaveBeenCalledWith('Socket.IO server created', {
      port: 3004,
      service: 'RedisIoAdapter',
    });

    server.close();
  });
});
