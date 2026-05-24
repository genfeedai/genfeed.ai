import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { runIdempotent } from './idempotency.util';

function createCache(
  overrides: Partial<{
    acquireLock: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    acquireLock: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    releaseLock: vi.fn().mockResolvedValue(true),
    set: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('runIdempotent', () => {
  it('returns cached results for duplicate completed requests', async () => {
    const cached = { id: 'batch-1' };
    const cache = createCache({
      get: vi.fn().mockResolvedValue(cached),
    });
    const operation = vi.fn();

    await expect(
      runIdempotent(cache as never, 'key-1', operation),
    ).resolves.toEqual(cached);

    expect(operation).not.toHaveBeenCalled();
    expect(cache.acquireLock).not.toHaveBeenCalled();
  });

  it('caches successful operation results for later duplicates', async () => {
    const cache = createCache();
    const result = { id: 'batch-1' };

    await expect(
      runIdempotent(cache as never, 'key-1', async () => result),
    ).resolves.toEqual(result);

    expect(cache.acquireLock).toHaveBeenCalledWith('idempotency:key-1', 3600);
    expect(cache.set).toHaveBeenCalledWith('idempotency-result:key-1', result, {
      ttl: 3600,
    });
    expect(cache.releaseLock).not.toHaveBeenCalled();
  });

  it('releases the lock when the operation fails so callers can retry', async () => {
    const cache = createCache();
    const error = new Error('boom');

    await expect(
      runIdempotent(cache as never, 'key-1', async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(cache.releaseLock).toHaveBeenCalledWith('idempotency:key-1');
  });

  it('rejects duplicates while the first request is still processing', async () => {
    const cache = createCache({
      acquireLock: vi.fn().mockResolvedValue(false),
    });

    await expect(
      runIdempotent(cache as never, 'key-1', async () => ({ id: 'batch-1' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
