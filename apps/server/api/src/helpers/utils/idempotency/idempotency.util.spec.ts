import type { CacheService } from '@api/services/cache/cache.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { runIdempotent } from './idempotency.util';

/**
 * An in-memory cache with expiring entries and locks, on a clock the test
 * moves by hand.
 */
function expiringCache() {
  let now = 0;
  const values = new Map<string, { expiresAt: number; value: unknown }>();
  const locks = new Map<string, number>();
  const cache = {
    acquireLock: async (key: string, ttlSeconds: number) => {
      const heldUntil = locks.get(key);
      if (heldUntil !== undefined && heldUntil > now) {
        return false;
      }
      locks.set(key, now + ttlSeconds);
      return true;
    },
    get: async (key: string) => {
      const entry = values.get(key);
      return entry && entry.expiresAt > now ? entry.value : null;
    },
    releaseLock: async (key: string) => locks.delete(key),
    set: async (key: string, value: unknown, options: { ttl: number }) => {
      values.set(key, { expiresAt: now + options.ttl, value });
      return true;
    },
  };
  return {
    advance: (seconds: number) => {
      now += seconds;
    },
    cache: cache as unknown as CacheService,
  };
}

/** An operation that counts its runs and returns a fresh batch each time. */
function createBatch() {
  let runs = 0;
  return {
    operation: async () => {
      runs += 1;
      return { id: `batch-${runs}` };
    },
    runs: () => runs,
  };
}

describe('runIdempotent', () => {
  it('runs once and replays the first result to duplicates within the hour', async () => {
    const { advance, cache } = expiringCache();
    const batch = createBatch();

    const first = await runIdempotent(cache, 'key-1', batch.operation);
    advance(3_599);
    const duplicate = await runIdempotent(cache, 'key-1', batch.operation);

    expect([first, duplicate]).toEqual([{ id: 'batch-1' }, { id: 'batch-1' }]);
    expect(batch.runs()).toBe(1);
  });

  it('runs again once the hour has passed', async () => {
    const { advance, cache } = expiringCache();
    const batch = createBatch();

    await runIdempotent(cache, 'key-1', batch.operation);
    advance(3_601);

    expect(await runIdempotent(cache, 'key-1', batch.operation)).toEqual({
      id: 'batch-2',
    });
  });

  it('keeps different keys apart', async () => {
    const { cache } = expiringCache();
    const batch = createBatch();

    const results = [
      await runIdempotent(cache, 'key-1', batch.operation),
      await runIdempotent(cache, 'key-2', batch.operation),
    ];

    expect(results).toEqual([{ id: 'batch-1' }, { id: 'batch-2' }]);
  });

  it('rejects a duplicate while the first request is still running', async () => {
    const { cache } = expiringCache();
    let finish: () => void = () => undefined;
    const first = runIdempotent(
      cache,
      'key-1',
      () =>
        new Promise<{ id: string }>((resolve) => {
          finish = () => resolve({ id: 'batch-1' });
        }),
    );

    await expect(
      runIdempotent(cache, 'key-1', async () => ({ id: 'batch-2' })),
    ).rejects.toBeInstanceOf(ConflictException);
    finish();
    await first;
  });

  it('lets a retry run after the operation fails', async () => {
    const { cache } = expiringCache();
    const batch = createBatch();

    await expect(
      runIdempotent(cache, 'key-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await runIdempotent(cache, 'key-1', batch.operation)).toEqual({
      id: 'batch-1',
    });
  });

  it('frees a short in-flight lock left by a crashed run, but keeps a finished result for the hour', async () => {
    const { advance, cache } = expiringCache();
    const batch = createBatch();
    void runIdempotent(cache, 'stuck', () => new Promise<never>(() => {}), {
      lockTtlSeconds: 120,
    });
    await runIdempotent(cache, 'done', batch.operation, {
      lockTtlSeconds: 120,
    });
    advance(121);

    const results = [
      await runIdempotent(cache, 'stuck', batch.operation, {
        lockTtlSeconds: 120,
      }),
      await runIdempotent(cache, 'done', batch.operation, {
        lockTtlSeconds: 120,
      }),
    ];

    expect(results).toEqual([{ id: 'batch-2' }, { id: 'batch-1' }]);
  });
});
