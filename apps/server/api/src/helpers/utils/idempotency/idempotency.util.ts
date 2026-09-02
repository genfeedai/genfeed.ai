import { CacheService } from '@api/services/cache/cache.service';
import { ConflictException } from '@nestjs/common';

const IDEMPOTENCY_TTL_SECONDS = 3600; // 1 hour window
const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_RESULT_PREFIX = 'idempotency-result:';

export interface RunIdempotentOptions {
  /** In-flight reservation window; shorten only when persistence can recover. */
  lockTtlSeconds?: number;
  /** Completed response replay window. */
  resultTtlSeconds?: number;
}

/**
 * Acquire an idempotency lock for the given key.
 *
 * Throws ConflictException if the key is already held (duplicate request).
 * The lock automatically expires after IDEMPOTENCY_TTL_SECONDS so stale
 * locks from crashed processes do not block retries indefinitely.
 */
export async function assertIdempotent(
  cacheService: CacheService,
  key: string,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS,
): Promise<void> {
  const lockKey = `${IDEMPOTENCY_PREFIX}${key}`;
  const acquired = await cacheService.acquireLock(lockKey, ttlSeconds);
  if (!acquired) {
    throw new ConflictException(
      `Duplicate request detected. Idempotency key "${key}" is already being processed or was recently completed.`,
    );
  }
}

/**
 * Release a previously acquired idempotency lock.
 *
 * Call this on failure paths so the caller can retry with the same key.
 * Do NOT call on success — the lock should remain held for the full TTL
 * to prevent re-submission of completed operations.
 */
export async function releaseIdempotencyKey(
  cacheService: CacheService,
  key: string,
): Promise<void> {
  const lockKey = `${IDEMPOTENCY_PREFIX}${key}`;
  await cacheService.releaseLock(lockKey);
}

/**
 * Execute an operation once for an idempotency key and cache the successful
 * result. Later duplicate requests within the TTL return the same payload
 * instead of creating duplicate work or double-charging credits.
 */
export async function runIdempotent<T>(
  cacheService: CacheService,
  key: string,
  operation: () => Promise<T>,
  options?: RunIdempotentOptions,
): Promise<T> {
  const resultKey = `${IDEMPOTENCY_RESULT_PREFIX}${key}`;
  const cached = await cacheService.get<T>(resultKey);
  if (cached !== null) {
    return cached;
  }

  await assertIdempotent(
    cacheService,
    key,
    options?.lockTtlSeconds ?? IDEMPOTENCY_TTL_SECONDS,
  );

  try {
    const result = await operation();
    await cacheService.set(resultKey, result, {
      ttl: options?.resultTtlSeconds ?? IDEMPOTENCY_TTL_SECONDS,
    });
    return result;
  } catch (error: unknown) {
    await releaseIdempotencyKey(cacheService, key);
    throw error;
  }
}
