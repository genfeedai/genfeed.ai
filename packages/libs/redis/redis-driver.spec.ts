import { describe, expect, it } from 'vitest';
import {
  isInProcessRedis,
  RedisDriver,
  resolveRedisDriver,
} from './redis-driver';

const configWith = (value: string | undefined) => ({
  get: (_key: string): string | undefined => value,
});

describe('resolveRedisDriver', () => {
  it('defaults to the redis driver when unset', () => {
    expect(resolveRedisDriver(configWith(undefined))).toBe(RedisDriver.REDIS);
  });

  it('selects the in-process driver when configured', () => {
    expect(resolveRedisDriver(configWith('in-process'))).toBe(
      RedisDriver.IN_PROCESS,
    );
  });

  it('falls back to the redis driver on unrecognized values', () => {
    expect(resolveRedisDriver(configWith('inprocess'))).toBe(RedisDriver.REDIS);
    expect(resolveRedisDriver(configWith('IN_PROCESS'))).toBe(
      RedisDriver.REDIS,
    );
  });
});

describe('isInProcessRedis', () => {
  it('reflects the resolved driver', () => {
    expect(isInProcessRedis(configWith('in-process'))).toBe(true);
    expect(isInProcessRedis(configWith('redis'))).toBe(false);
    expect(isInProcessRedis(configWith(undefined))).toBe(false);
  });
});
