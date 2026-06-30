import {
  buildBullMQConnection,
  buildNodeRedisClientOptions,
  buildNodeRedisSocketOptions,
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

  it('enables node-redis TLS when the URL uses rediss', () => {
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
    expect(buildNodeRedisSocketOptions(config)).toEqual({
      connectTimeout: 3000,
      tls: true,
    });
  });

  it('passes separately injected Redis passwords to node-redis clients', () => {
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
    expect(buildNodeRedisClientOptions(config)).toEqual({
      password: 'secret-from-ssm',
      socket: {
        connectTimeout: 3000,
        tls: true,
      },
      url: 'rediss://redis.internal:6379',
    });
  });
});
