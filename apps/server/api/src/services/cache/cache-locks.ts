import { randomUUID } from 'node:crypto';
import {
  EXTEND_OWNED_LOCK_SCRIPT,
  RELEASE_OWNED_CLAIM_SCRIPT,
} from '@api/services/cache/cache-claim-scripts';
import type { CacheClientService } from '@api/services/cache/cache-client.service';
import type { LoggerService } from '@libs/logger/logger.service';

type HeldLock = { expiresAt: number; token: string };

/**
 * Distributed locks over Redis. A lock's value is a random token written when
 * it is acquired and kept here, so release and extension compare the token
 * first: a holder whose lock expired and was taken by another process never
 * deletes or extends the new owner's lock.
 */
export class CacheLocks {
  private readonly held = new Map<string, HeldLock>();

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly logger: LoggerService,
  ) {}

  async acquire(lockKey: string, ttlSeconds: number): Promise<boolean> {
    if (!this.cacheClientService.isReady) {
      return false;
    }

    try {
      const token = randomUUID();
      // SET NX (only set if not exists) with EX (expiration in seconds).
      const result = await this.cacheClientService.instance.set(
        `lock:${lockKey}`,
        token,
        'EX',
        ttlSeconds,
        'NX',
      );
      if (result !== 'OK') {
        return false;
      }
      this.remember(lockKey, token, ttlSeconds);
      return true;
    } catch (error: unknown) {
      this.logger.error('CacheService acquireLock error', { error, lockKey });
      return false;
    }
  }

  /** Release a lock this process holds; another holder's lock is left alone. */
  async release(lockKey: string): Promise<boolean> {
    const token = this.held.get(lockKey)?.token;
    this.held.delete(lockKey);
    if (!token || !this.cacheClientService.isReady) {
      return false;
    }

    try {
      return (
        Number(
          await this.cacheClientService.instance.eval(
            RELEASE_OWNED_CLAIM_SCRIPT,
            1,
            `lock:${lockKey}`,
            token,
          ),
        ) === 1
      );
    } catch (error: unknown) {
      this.logger.error('CacheService releaseLock error', { error, lockKey });
      return false;
    }
  }

  /**
   * Run `fn` under the lock and extend it while `fn` runs, so work that
   * outlasts the TTL keeps its lock. Null when the lock is taken.
   */
  async run<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T | null> {
    if (!(await this.acquire(lockKey, ttlSeconds))) {
      this.logger.debug(
        `CacheService withLock: lock not acquired for ${lockKey}`,
      );
      return null;
    }

    const heartbeat = setInterval(
      () => {
        void this.extend(lockKey, ttlSeconds).then((extended) => {
          if (!extended) {
            clearInterval(heartbeat);
          }
        });
      },
      (ttlSeconds * 1000) / 3,
    );
    heartbeat.unref?.();

    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
      await this.release(lockKey);
    }
  }

  private async extend(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const token = this.held.get(lockKey)?.token;
    if (!token || !this.cacheClientService.isReady) {
      return false;
    }

    try {
      const extended =
        Number(
          await this.cacheClientService.instance.eval(
            EXTEND_OWNED_LOCK_SCRIPT,
            1,
            `lock:${lockKey}`,
            token,
            ttlSeconds,
          ),
        ) === 1;
      if (extended) {
        this.remember(lockKey, token, ttlSeconds);
      }
      return extended;
    } catch (error: unknown) {
      this.logger.error('CacheService extendLock error', { error, lockKey });
      return false;
    }
  }

  private remember(lockKey: string, token: string, ttlSeconds: number): void {
    const now = Date.now();
    // A lock nobody releases (a window marker) lapses with its TTL: forget it
    // so this map does not grow with every marker ever taken.
    for (const [key, lock] of this.held) {
      if (lock.expiresAt <= now) {
        this.held.delete(key);
      }
    }
    this.held.set(lockKey, { expiresAt: now + ttlSeconds * 1000, token });
  }
}
