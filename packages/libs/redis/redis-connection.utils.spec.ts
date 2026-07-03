import {
  buildBullMQConnection,
  buildIoRedisClientOptions,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { describe, expect, it } from 'vitest';

describe('redis connection utilities', () => {
  it('builds lazy BullMQ options without startup version checks', () => {
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
    expect(connection.retryStrategy()).toBeNull();
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
});
