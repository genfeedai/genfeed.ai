import {
  BullMQConnectionProfile,
  buildBullMQConnection,
  buildIoRedisClientOptions,
  parseRedisConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
  resolveBullMQWorkerConnectionProfile,
} from '@libs/redis/redis-connection.utils';
import { describe, expect, it } from 'vitest';

/** Build a config accessor from a plain env map for the workload tests. */
function envAccessor(env: Record<string, string | boolean | number>) {
  return { get: (key: string) => env[key] };
}

describe('redis connection utilities', () => {
  it('builds a fail-fast BullMQ producer connection by default', () => {
    const config = {
      host: 'redis.internal',
      password: 'secret',
      port: 6380,
      tls: true,
      url: 'rediss://:secret@redis.internal:6380',
    };

    const connection = buildBullMQConnection(config);

    expect(connection).toMatchObject({
      connectTimeout: 3000,
      enableOfflineQueue: false,
      enableReadyCheck: false,
      host: 'redis.internal',
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      password: 'secret',
      port: 6380,
      skipVersionCheck: true,
      tls: {},
    });
    expect(connection.retryStrategy(1)).toBeNull();
  });

  it.each([
    {
      environment: { isProduction: true, isStaging: false },
      expected: BullMQConnectionProfile.WORKER,
      name: 'production',
    },
    {
      environment: { isProduction: false, isStaging: true },
      expected: BullMQConnectionProfile.WORKER,
      name: 'staging',
    },
    {
      environment: { isProduction: false, isStaging: false },
      expected: BullMQConnectionProfile.PRODUCER,
      name: 'development or test',
    },
  ])(
    'selects the $expected profile for $name workers',
    ({ environment, expected }) => {
      expect(resolveBullMQWorkerConnectionProfile(environment)).toBe(expected);
    },
  );

  it('builds a production worker connection that retries indefinitely with bounded backoff', () => {
    const connection = buildBullMQConnection(
      {
        host: 'redis.internal',
        port: 6379,
        tls: false,
        url: 'redis://redis.internal:6379',
      },
      BullMQConnectionProfile.WORKER,
    );

    expect(connection).toMatchObject({
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });
    expect(connection.retryStrategy(1)).toBe(1_000);
    expect(connection.retryStrategy(8)).toBe(Math.exp(8));
    expect(connection.retryStrategy(100)).toBe(20_000);
  });

  it('enables TLS when the URL uses rediss', () => {
    const config = parseRedisConnection({
      get: (key) =>
        key === 'REDIS_URL' ? 'rediss://:secret@redis.internal:6380' : false,
    });

    expect(config).toEqual({
      host: 'redis.internal',
      password: 'secret',
      port: 6380,
      tls: true,
      url: 'rediss://:secret@redis.internal:6380',
    });
    expect(buildIoRedisClientOptions(config)).toEqual({
      connectTimeout: 3000,
      host: 'redis.internal',
      lazyConnect: true,
      password: 'secret',
      port: 6380,
      tls: {},
    });
  });

  it('passes separately injected Redis passwords to ioredis clients', () => {
    const config = parseRedisConnection({
      get: (key) => {
        if (key === 'REDIS_URL') {
          return 'rediss://redis.internal:6379';
        }
        if (key === 'REDIS_PASSWORD') {
          return 'secret-from-ssm';
        }
        return false;
      },
    });

    expect(config).toEqual({
      host: 'redis.internal',
      password: 'secret-from-ssm',
      port: 6379,
      tls: true,
      url: 'rediss://redis.internal:6379',
    });
    expect(buildIoRedisClientOptions(config)).toEqual({
      connectTimeout: 3000,
      host: 'redis.internal',
      lazyConnect: true,
      password: 'secret-from-ssm',
      port: 6379,
      tls: {},
    });
  });

  it('supports a custom retryStrategy for resilient clients', () => {
    const config = {
      host: 'localhost',
      port: 6379,
      tls: false,
      url: 'redis://localhost:6379',
    };

    const retryStrategy = (retries: number) =>
      retries > 3 ? null : retries * 100;

    const options = buildIoRedisClientOptions(config, {
      connectTimeout: 5000,
      lazyConnect: false,
      retryStrategy,
    });

    expect(options).toEqual({
      connectTimeout: 5000,
      host: 'localhost',
      lazyConnect: false,
      port: 6379,
      retryStrategy,
    });
  });

  it('includes the logical db in ioredis options only when set', () => {
    const withDb = buildIoRedisClientOptions({
      db: 2,
      host: 'localhost',
      port: 6379,
      tls: false,
      url: 'redis://localhost:6379',
    });
    expect(withDb).toMatchObject({ db: 2 });

    const withoutDb = buildIoRedisClientOptions({
      host: 'localhost',
      port: 6379,
      tls: false,
      url: 'redis://localhost:6379',
    });
    expect(withoutDb).not.toHaveProperty('db');
  });

  it('includes the logical db in BullMQ options only when set', () => {
    const withDb = buildBullMQConnection({
      db: 0,
      host: 'localhost',
      port: 6379,
      tls: false,
      url: 'redis://localhost:6379',
    });
    expect(withDb).toMatchObject({ db: 0 });

    const withoutDb = buildBullMQConnection({
      host: 'localhost',
      port: 6379,
      tls: false,
      url: 'redis://localhost:6379',
    });
    expect(withoutDb).not.toHaveProperty('db');
  });
});

describe('parseRedisConnectionForWorkload — workload isolation (#1186)', () => {
  const baseEnv = { REDIS_URL: 'redis://redis.internal:6379' };

  it('DEFAULT workload matches the base connection with no explicit db', () => {
    const accessor = envAccessor(baseEnv);
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.DEFAULT),
    ).toEqual(parseRedisConnection(accessor));
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.DEFAULT).db,
    ).toBeUndefined();
  });

  it('assigns each workload its own default logical db on the shared base', () => {
    const accessor = envAccessor(baseEnv);
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.QUEUE).db,
    ).toBe(0);
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.CACHE).db,
    ).toBe(1);
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.RATE_LIMIT).db,
    ).toBe(2);
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.SOCKET).db,
    ).toBe(3);
    // All four share the same host — isolation is by db until a per-workload
    // URL points one at a dedicated instance.
    for (const workload of [
      RedisWorkload.QUEUE,
      RedisWorkload.CACHE,
      RedisWorkload.RATE_LIMIT,
      RedisWorkload.SOCKET,
    ]) {
      expect(parseRedisConnectionForWorkload(accessor, workload).host).toBe(
        'redis.internal',
      );
    }
  });

  it('routes a workload to its dedicated instance via REDIS_<WORKLOAD>_URL', () => {
    const accessor = envAccessor({
      ...baseEnv,
      REDIS_CACHE_URL: 'redis://cache.internal:6380',
    });
    const cache = parseRedisConnectionForWorkload(
      accessor,
      RedisWorkload.CACHE,
    );
    expect(cache.host).toBe('cache.internal');
    expect(cache.port).toBe(6380);
    // Other workloads still resolve against the base endpoint.
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.QUEUE).host,
    ).toBe('redis.internal');
  });

  it('lets REDIS_<WORKLOAD>_DB override the default index', () => {
    const accessor = envAccessor({ ...baseEnv, REDIS_RATELIMIT_DB: 7 });
    expect(
      parseRedisConnectionForWorkload(accessor, RedisWorkload.RATE_LIMIT).db,
    ).toBe(7);
  });

  it('falls back to the base password and TLS when the workload URL omits them', () => {
    const accessor = envAccessor({
      REDIS_URL: 'redis://redis.internal:6379',
      REDIS_PASSWORD: 'secret-from-ssm',
      REDIS_TLS: true,
      REDIS_SOCKET_URL: 'redis://socket.internal:6390',
    });
    const socket = parseRedisConnectionForWorkload(
      accessor,
      RedisWorkload.SOCKET,
    );
    expect(socket.host).toBe('socket.internal');
    expect(socket.password).toBe('secret-from-ssm');
    expect(socket.tls).toBe(true);
    expect(socket.db).toBe(3);
  });
});
