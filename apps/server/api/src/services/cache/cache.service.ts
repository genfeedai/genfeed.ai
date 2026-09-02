import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

export type ServiceCacheOptions = {
  tags?: string[];
  ttl?: number;
};

@Injectable()
export class CacheService {
  private readonly defaultTtl = 300; // 5 minutes default
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly cacheTagsService: CacheTagsService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): Redis {
    return this.cacheClientService.instance;
  }

  /**
   * Whether the cache client can accept a command right now.
   *
   * The `try/catch` on every method below can only fail open on a *rejection*.
   * ioredis buffers commands in its offline queue while a client is
   * disconnected, so a command issued against an unreachable Redis does not
   * reject — it never settles at all, and since this client's reconnect is
   * unbounded by design (see `WorkloadRedisClientService`), nothing ever
   * releases it. A cached endpoint then hangs forever instead of serving
   * uncached, which is the opposite of the intended degradation.
   *
   * `isReady` is exposed by the client service for exactly this gate. Checking
   * it turns "Redis is unreachable" into an immediate cache miss.
   */
  private get isAvailable(): boolean {
    return this.cacheClientService.isReady;
  }

  private logOperationError(
    operation: string,
    details: Parameters<LoggerService['error']>[1],
  ): void {
    this.logger.error(`${this.constructorName} ${operation} error`, details);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error: unknown) {
      this.logOperationError('get', { error, key });
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    options: ServiceCacheOptions = {},
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const ttl = options.ttl || this.defaultTtl;

      await this.client.setex(key, ttl, serialized);
      await this.cacheTagsService.setTags(key, options.tags ?? []);
      return true;
    } catch (error: unknown) {
      this.logOperationError('set', { error, key });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.del(key)) > 0;
    } catch (error: unknown) {
      this.logOperationError('del', { error, key });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.exists(key)) === 1;
    } catch (error: unknown) {
      this.logOperationError('exists', { error, key });
      return false;
    }
  }

  async incr(key: string, by: number = 1): Promise<number> {
    if (!this.isAvailable) {
      return 0;
    }

    try {
      return await this.client.incrby(key, by);
    } catch (error: unknown) {
      this.logOperationError('incr', {
        by,
        error,
        key,
      });
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.expire(key, ttl)) === 1;
    } catch (error: unknown) {
      this.logOperationError('expire', {
        error,
        key,
        ttl,
      });
      return false;
    }
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (!this.isAvailable) {
      return keys.map(() => null);
    }

    try {
      const values = await this.client.mget(keys);
      return values.map((value) => (value ? (JSON.parse(value) as T) : null));
    } catch (error: unknown) {
      this.logOperationError('mget', { error, keys });
      return keys.map(() => null);
    }
  }

  async mset(
    keyValues: Record<string, unknown>,
    ttl?: number,
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const pipeline = this.client.multi();

      Object.entries(keyValues).forEach(([key, value]) => {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
      return true;
    } catch (error: unknown) {
      this.logOperationError('mset', {
        error,
        keyValues,
      });
      return false;
    }
  }

  invalidateByTags(tags: string[]): Promise<number> {
    if (!this.isAvailable) {
      return Promise.resolve(0);
    }

    return this.cacheTagsService.invalidateByTags(tags);
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: ServiceCacheOptions = {},
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      const value = await factory();
      await this.set(key, value, options);
      return value;
    } catch (error: unknown) {
      this.logOperationError('getOrSet', {
        error,
        key,
      });
      return await factory();
    }
  }

  async getOrSetWithLock<T>(
    key: string,
    factory: () => Promise<T | undefined>,
    options: ServiceCacheOptions = {},
    lockTtlSeconds: number = 5,
  ): Promise<T | undefined> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = `cache-populate:${key}`;
    const acquired = await this.acquireLock(lockKey, lockTtlSeconds);

    if (acquired) {
      try {
        const doubleCheck = await this.get<T>(key);
        if (doubleCheck !== null) {
          return doubleCheck;
        }

        const value = await factory();
        if (value !== undefined) {
          await this.set(key, value, options);
        }
        return value;
      } finally {
        await this.releaseLock(lockKey);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    const retryCache = await this.get<T>(key);
    if (retryCache !== null) {
      return retryCache;
    }

    this.logger.debug(
      `${this.constructorName} getOrSetWithLock fallback for ${key}`,
    );
    const value = await factory();
    if (value !== undefined) {
      await this.set(key, value, options);
    }
    return value;
  }

  async flush(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      await this.client.flushdb();
      this.logger.warn(`${this.constructorName} cache flushed`);
      return true;
    } catch (error: unknown) {
      this.logOperationError('flush', error);
      return false;
    }
  }

  generateKey(namespace: string, ...parts: (string | number)[]): string {
    return `${namespace}:${parts.join(':')}`;
  }

  /**
   * Acquire a distributed lock using Redis SET NX with TTL.
   * Returns true if lock was acquired, false if already held by another process.
   *
   * @param lockKey - Unique identifier for the lock
   * @param ttlSeconds - Lock expiration time (prevents deadlocks if process crashes)
   */
  async acquireLock(
    lockKey: string,
    ttlSeconds: number = 300,
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const key = `lock:${lockKey}`;
      // SET NX (only set if not exists) with EX (expiration in seconds)
      const result = await this.client.set(
        key,
        Date.now().toString(),
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error: unknown) {
      this.logOperationError('acquireLock', {
        error,
        lockKey,
      });
      return false;
    }
  }

  /**
   * Claim `key` exactly once inside `ttlSeconds`, reporting the three outcomes
   * separately.
   *
   * `acquireLock` cannot serve this: it collapses "already held" and "Redis is
   * unreachable" into the same `false`. Idempotency guards need them apart —
   * treating an unreachable cache as "already seen" would silently discard
   * every inbound event for the duration of the outage, which is a far worse
   * failure than handling one event twice.
   *
   * Claims normally expire with the window; a caller whose processing fails
   * after claiming may `del` the key so the sender's retry is not suppressed.
   *
   * @param key - Namespaced identity of the thing being claimed
   * @param ttlSeconds - How long the claim suppresses repeats
   * @param tags - Cache tags that own a successful claim
   */
  async claimOnce(
    key: string,
    ttlSeconds: number,
    tags: string[] = [],
  ): Promise<'claimed' | 'duplicate' | 'unavailable'> {
    if (!this.isAvailable) {
      return 'unavailable';
    }

    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');

      if (result !== 'OK') {
        return 'duplicate';
      }

      await this.cacheTagsService.setTags(key, tags);
      return 'claimed';
    } catch (error: unknown) {
      this.logOperationError('claimOnce', { error, key });
      return 'unavailable';
    }
  }

  /**
   * Release a distributed lock.
   *
   * @param lockKey - The lock identifier to release
   */
  async releaseLock(lockKey: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const key = `lock:${lockKey}`;
      return (await this.client.del(key)) > 0;
    } catch (error: unknown) {
      this.logOperationError('releaseLock', {
        error,
        lockKey,
      });
      return false;
    }
  }

  /**
   * Execute a function while holding a distributed lock.
   * Automatically acquires lock before execution and releases after.
   * If lock cannot be acquired, returns null without executing the function.
   *
   * @param lockKey - Unique identifier for the lock
   * @param fn - Function to execute while holding the lock
   * @param ttlSeconds - Lock expiration time (default: 5 minutes)
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, ttlSeconds);
    if (!acquired) {
      this.logger.debug(
        `${this.constructorName} withLock: lock not acquired for ${lockKey}`,
      );
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}
