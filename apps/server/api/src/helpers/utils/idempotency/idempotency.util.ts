import { CacheService } from '@api/services/cache/services/cache.service';
import { ConflictException } from '@nestjs/common';

const IDEMPOTENCY_TTL_SECONDS = 3600; // 1 hour window
const IDEMPOTENCY_PREFIX = 'idempotency:';

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
): Promise<void> {
  const lockKey = `${IDEMPOTENCY_PREFIX}${key}`;
  const acquired = await cacheService.acquireLock(
    lockKey,
    IDEMPOTENCY_TTL_SECONDS,
  );
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
