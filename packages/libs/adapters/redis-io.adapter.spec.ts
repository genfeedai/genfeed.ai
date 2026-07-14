import { createServer } from 'node:http';
import { RedisIoAdapter } from '@libs/adapters/redis-io.adapter';
import type { LoggerService } from '@libs/logger/logger.service';
import * as redisAdapter from '@socket.io/redis-adapter';
import Redis from 'ioredis';
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

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

type RedisClientSubset = Pick<Redis, 'connect' | 'duplicate'>;

describe('RedisIoAdapter', () => {
  const redisUrl = 'redis://localhost:6379';

  /** Build the `{ get }` config accessor the adapter now reads (#1186). */
  const accessor = (env: Record<string, string | boolean | number> = {}) => ({
    get: (key: string) => ({ REDIS_URL: redisUrl, ...env })[key],
  });

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
    const adapter = new RedisIoAdapter(undefined, accessor(), loggerService);
    expect(adapter).toBeDefined();
  });

  it('should connect to Redis and initialize adapter constructor', async () => {
    const pubClient = buildMockClient();
    const subClient = buildMockClient();
    const adapterConstructor = Symbol('adapter-constructor');

    pubClient.duplicate.mockReturnValue(subClient as unknown as Redis);

    vi.mocked(Redis).mockImplementation(() => pubClient as unknown as Redis);
    vi.mocked(redisAdapter.createAdapter).mockReturnValue(
      adapterConstructor as unknown as ReturnType<
        typeof redisAdapter.createAdapter
      >,
    );

    const adapter = new RedisIoAdapter(undefined, accessor(), loggerService);
    await adapter.connectToRedis();

    expect(pubClient.connect).toHaveBeenCalledOnce();
    expect(subClient.connect).toHaveBeenCalledOnce();
    expect(loggerService.log).toHaveBeenCalledWith('Redis adapter connected', {
      service: 'RedisIoAdapter',
    });
  });

  it('should pass TLS and password options to Redis clients', async () => {
    const pubClient = buildMockClient();
    const subClient = buildMockClient();
    const adapterConstructor = Symbol('adapter-constructor');

    pubClient.duplicate.mockReturnValue(subClient as unknown as Redis);
    vi.mocked(Redis).mockImplementation(() => pubClient as unknown as Redis);
    vi.mocked(redisAdapter.createAdapter).mockReturnValue(
      adapterConstructor as unknown as ReturnType<
        typeof redisAdapter.createAdapter
      >,
    );

    const adapter = new RedisIoAdapter(
      undefined,
      accessor({
        REDIS_PASSWORD: 'secret-from-ssm',
        REDIS_URL: 'rediss://redis.internal:6379',
      }),
      loggerService,
    );
    await adapter.connectToRedis();

    // The socket.io adapter resolves the isolated SOCKET workload, so the client
    // options carry its dedicated logical DB (default 3) alongside TLS/password.
    expect(vi.mocked(Redis)).toHaveBeenCalledWith({
      connectTimeout: 3000,
      db: 3,
      host: 'redis.internal',
      lazyConnect: true,
      password: 'secret-from-ssm',
      port: 6379,
      tls: {},
    });
  });

  it('should log errors when Redis connection fails', async () => {
    const pubClient = buildMockClient();
    const subClient = buildMockClient();

    pubClient.duplicate.mockReturnValue(subClient as unknown as Redis);
    pubClient.connect.mockRejectedValueOnce(new Error('connection failed'));

    vi.mocked(Redis).mockImplementation(() => pubClient as unknown as Redis);

    const adapter = new RedisIoAdapter(undefined, accessor(), loggerService);
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
      accessor(),
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

  describe('createIOServer CORS (shared allowlist, #1224)', () => {
    /** Mirror how the `cors` package evaluates an array of string | RegExp. */
    const originAllows = (
      origins: (string | RegExp)[],
      origin: string,
    ): boolean =>
      origins.some((entry) =>
        entry instanceof RegExp ? entry.test(origin) : entry === origin,
      );

    const buildServerOrigins = (nodeEnv: string): (string | RegExp)[] => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      try {
        const appRef = { getHttpServer: () => createServer() };
        const adapter = new RedisIoAdapter(
          appRef as unknown as never,
          accessor(),
          loggerService,
        );
        const server = adapter.createIOServer(0);
        const origins =
          (
            server.engine as unknown as {
              opts?: { cors?: { origin?: (string | RegExp)[] } };
            }
          ).opts?.cors?.origin ?? [];
        server.close();
        return origins;
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    };

    it('allows the production app origin app.genfeed.ai (the #1224 regression)', () => {
      const origins = buildServerOrigins('production');

      // The exact origin that was being CORS-rejected → "Socket disconnected".
      expect(originAllows(origins, 'https://app.genfeed.ai')).toBe(true);
      // Sibling subdomains from the canonical GENFEED_SUBDOMAINS list.
      expect(originAllows(origins, 'https://admin.genfeed.ai')).toBe(true);
      expect(originAllows(origins, 'https://studio.genfeed.ai')).toBe(true);
    });

    it('still rejects unauthorized and non-https origins in production', () => {
      const origins = buildServerOrigins('production');

      expect(originAllows(origins, 'https://evil.genfeed.ai')).toBe(false);
      expect(originAllows(origins, 'http://app.genfeed.ai')).toBe(false);
      // Stale origins removed by consolidating onto the shared allowlist.
      expect(originAllows(origins, 'https://dashboard.genfeed.ai')).toBe(false);
    });

    it('allows the local app origin in development', () => {
      const origins = buildServerOrigins('development');

      expect(originAllows(origins, 'http://localhost:3000')).toBe(true);
      expect(originAllows(origins, 'http://genfeed.localhost:3111')).toBe(true);
    });
  });
});
