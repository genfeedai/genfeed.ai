import type { RedisClientType } from 'redis';

export async function storeRedisSnapshot<T>(
  publisher: RedisClientType,
  cacheKey: string,
  keysSetKey: string,
  ttlSeconds: number,
  keysSetTtlSeconds: number,
  payload: T,
): Promise<void> {
  await Promise.all([
    publisher.setEx(cacheKey, ttlSeconds, JSON.stringify(payload)),
    publisher.sAdd(keysSetKey, cacheKey),
    publisher.expire(keysSetKey, keysSetTtlSeconds),
  ]);
}

export async function invalidateRedisSnapshot(
  publisher: RedisClientType,
  keysSetKey: string,
): Promise<number> {
  const keys = await publisher.sMembers(keysSetKey);

  if (keys.length > 0) {
    await publisher.unlink([...keys, keysSetKey]);
  } else {
    await publisher.unlink(keysSetKey);
  }

  return keys.length;
}

export async function collectRedisKeysByPattern(
  publisher: RedisClientType,
  pattern: string,
): Promise<string[]> {
  const keys: string[] = [];

  for await (const key of publisher.scanIterator({
    COUNT: 100,
    MATCH: pattern,
  })) {
    keys.push(key);
  }

  return keys;
}
