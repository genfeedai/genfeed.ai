import type Redis from 'ioredis';

export async function storeRedisSnapshot<T>(
  publisher: Redis,
  cacheKey: string,
  keysSetKey: string,
  ttlSeconds: number,
  keysSetTtlSeconds: number,
  payload: T,
): Promise<void> {
  await Promise.all([
    publisher.setex(cacheKey, ttlSeconds, JSON.stringify(payload)),
    publisher.sadd(keysSetKey, cacheKey),
    publisher.expire(keysSetKey, keysSetTtlSeconds),
  ]);
}

export async function invalidateRedisSnapshot(
  publisher: Redis,
  keysSetKey: string,
): Promise<number> {
  const keys = await publisher.smembers(keysSetKey);

  if (keys.length > 0) {
    await publisher.unlink([...keys, keysSetKey]);
  } else {
    await publisher.unlink(keysSetKey);
  }

  return keys.length;
}

export async function collectRedisKeysByPattern(
  publisher: Redis,
  pattern: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, foundKeys] = await publisher.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    );

    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  return keys;
}
