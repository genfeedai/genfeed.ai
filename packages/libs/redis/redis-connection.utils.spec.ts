import {
  buildBullMQConnection,
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
});
