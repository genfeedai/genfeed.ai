import { CacheClientService } from '@api/services/cache/cache-client.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

interface ClientOptions {
  db?: number;
  host: string;
  lazyConnect: boolean;
  port: number;
  retryStrategy: (retries: number) => number;
}

/**
 * An ioredis stand-in: it keeps its status and listeners, and the test decides
 * how the server answers connect and quit.
 */
const redis = vi.hoisted(() => {
  const state: {
    client?: FakeRedis;
    connect: 'ok' | 'refused' | 'slow';
    quit: 'ok' | 'fails' | 'hangs';
  } = { connect: 'ok', quit: 'ok' };

  class FakeRedis {
    readonly handlers = new Map<string, Handler>();
    status = 'wait';

    constructor(readonly options: ClientOptions) {
      state.client = this;
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
    }

    removeAllListeners() {
      this.handlers.clear();
      return this;
    }

    async connect() {
      if (state.connect === 'refused') throw new Error('ECONNREFUSED');
      if (state.connect === 'slow') return new Promise(() => undefined);
      this.status = 'ready';
      this.emit('connect');
      this.emit('ready');
    }

    async quit() {
      if (state.quit === 'fails') throw new Error('quit failed');
      if (state.quit === 'hangs') return new Promise(() => undefined);
      this.status = 'end';
      return 'OK';
    }

    disconnect() {
      this.status = 'end';
    }
  }

  return { FakeRedis, state };
});

vi.mock('ioredis', () => ({ default: redis.FakeRedis }));

const OUTAGE = new Error('ECONNREFUSED');

describe('CacheClientService', () => {
  let env: Record<string, string>;
  let logs: [string, string][];
  let service: CacheClientService;

  const client = () => {
    if (!redis.state.client) throw new Error('No Redis client was created');
    return redis.state.client;
  };
  const build = () =>
    new CacheClientService(
      { get: (key: string) => env[key] } as unknown as ConfigService,
      {
        error: (message: string) => logs.push(['error', message]),
        log: (message: string) => logs.push(['log', message]),
        warn: (message: string) => logs.push(['warn', message]),
      } as unknown as LoggerService,
    );
  /** One failed reconnect attempt: ioredis asks for a delay, then reports. */
  const failAttempt = (retries: number) => {
    const delay = client().options.retryStrategy(retries);
    client().emit('error', OUTAGE);
    return delay;
  };
  const failAttempts = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, index) => failAttempt(from + index));

  beforeEach(() => {
    env = { REDIS_URL: 'redis://localhost:6379' };
    logs = [];
    redis.state.connect = 'ok';
    redis.state.quit = 'ok';
    service = build();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connection', () => {
    it.each([
      [{}, { db: 1, host: 'localhost', port: 6379 }],
      [{ REDIS_CACHE_DB: '4' }, { db: 4, host: 'localhost', port: 6379 }],
      [
        { REDIS_CACHE_URL: 'redis://cache.internal:6380' },
        { db: 1, host: 'cache.internal', port: 6380 },
      ],
    ])('isolates the cache workload (%o)', (overrides, expected) => {
      Object.assign(env, overrides);

      build();

      expect(client().options).toMatchObject({
        ...expected,
        lazyConnect: true,
      });
    });

    it('connects on module init and reports ready', async () => {
      expect(service.isReady).toBe(false);

      await service.onModuleInit();

      expect(service.isReady).toBe(true);
      expect(service.instance).toBe(client());
      expect(logs).toContainEqual([
        'log',
        'CacheClientService initialized successfully',
      ]);
    });

    it('disables the client without throwing when Redis refuses', async () => {
      redis.state.connect = 'refused';

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(service.isReady).toBe(false);
      expect(logs).toEqual([
        ['warn', 'CacheClientService failed to connect - client disabled'],
      ]);
    });

    it('gives up waiting for a slow connection after three seconds', async () => {
      vi.useFakeTimers();
      redis.state.connect = 'slow';

      const init = service.onModuleInit();
      await vi.advanceTimersByTimeAsync(3_000);
      await init;

      expect(service.isReady).toBe(false);
      expect(logs).toEqual([
        ['warn', 'CacheClientService failed to connect - client disabled'],
      ]);
    });
  });

  describe('reconnecting', () => {
    it.each([
      [0, 100],
      [3, 800],
      [8, 25_600],
      [9, 30_000],
      [100, 30_000],
      [10_000, 30_000],
    ])(
      'waits after attempt %i for %ims and never gives up',
      (retries, delay) => {
        expect(client().options.retryStrategy(retries)).toBe(delay);
      },
    );

    it('logs every attempt while the outage is new, then only summaries', () => {
      failAttempts(0, 10);
      const early = logs.splice(0);
      failAttempts(10, 30);

      expect(early).toHaveLength(20);
      expect(early.slice(0, 2)).toEqual([
        ['warn', 'CacheClientService reconnecting in 100ms (attempt 1)'],
        ['error', 'CacheClientService Redis client error'],
      ]);
      expect(logs).toEqual([
        [
          'error',
          'CacheClientService Redis still unreachable after 11 reconnect attempts (0 errors suppressed since the last line), retrying every 30000ms',
        ],
      ]);
    });

    it('writes one summary a minute, counting the errors it swallowed', () => {
      vi.useFakeTimers();
      failAttempts(0, 20);
      logs.splice(0);

      vi.advanceTimersByTime(60_000);
      client().emit('error', OUTAGE);

      expect(logs).toEqual([
        [
          'error',
          'CacheClientService Redis still unreachable after 20 reconnect attempts (9 errors suppressed since the last line), retrying every 30000ms',
        ],
      ]);
    });

    it('reports how many attempts a recovery took, then starts fresh', () => {
      failAttempts(0, 15);
      logs.splice(0);

      client().emit('ready');
      client().emit('error', OUTAGE);

      expect(logs).toEqual([
        [
          'log',
          'CacheClientService Redis client ready (recovered after 15 reconnect attempts)',
        ],
        ['error', 'CacheClientService Redis client error'],
      ]);
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      logs.splice(0);
    });

    it('quits gracefully and stops listening', async () => {
      await service.onModuleDestroy();

      expect(client().status).toBe('end');
      expect(client().handlers.size).toBe(0);
      expect(logs).toEqual([['log', 'CacheClientService disconnected']]);
    });

    it('forces the connection closed when quit fails', async () => {
      redis.state.quit = 'fails';

      await service.onModuleDestroy();

      expect(client().status).toBe('end');
      expect(logs).toEqual([['error', 'CacheClientService disconnect error']]);
    });

    it('forces the connection closed when quit hangs', async () => {
      vi.useFakeTimers();
      redis.state.quit = 'hangs';

      const destroy = service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(3_000);
      await destroy;

      expect(client().status).toBe('end');
      expect(logs).toEqual([['error', 'CacheClientService disconnect error']]);
    });
  });
});
