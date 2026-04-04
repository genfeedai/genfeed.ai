import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items in cache
  onEvict?: (key: string, value: unknown) => void;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

/**
 * In-memory cache utility with TTL, size limits, and eviction strategies
 */
@Injectable()
export class CacheUtil<K = string, V = unknown> {
  private cache = new Map<K, CacheEntry<V>>();
  private stats = {
    evictions: 0,
    hits: 0,
    misses: 0,
  };

  constructor(
    private readonly options: CacheOptions = {},
    private readonly logger?: LoggerService,
  ) {
    this.options = {
      maxSize: 1000,
      ttl: 300_000, // 5 minutes default
      ...options,
    };

    // Setup cleanup interval
    if (this.options.ttl! > 0) {
      setInterval(() => this.cleanup(), Math.min(this.options.ttl! / 2, 60000));
    }
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl || this.options.ttl!;

    // Check if we need to evict items
    if (this.cache.size >= this.options.maxSize! && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      accessCount: 0,
      lastAccessed: now,
      timestamp: now,
      ttl: entryTtl,
      value,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) {
        this.cache.delete(key);
      }
      return false;
    }
    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { evictions: 0, hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      evictions: this.stats.evictions,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Memoize a function with caching
   */
  memoize<Args extends unknown[], Return extends V>(
    fn: (...args: Args) => Return | Promise<Return>,
    keyGenerator?: (...args: Args) => K,
  ): (...args: Args) => Return | Promise<Return> {
    return (...args: Args) => {
      const key = keyGenerator
        ? keyGenerator(...args)
        : (JSON.stringify(args) as K);

      if (this.has(key)) {
        return this.get(key)! as Return;
      }

      const result = fn(...args);

      if (result instanceof Promise) {
        return result.then((value) => {
          this.set(key, value as V);
          return value;
        });
      } else {
        this.set(key, result as V);
        return result;
      }
    };
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict least recently used item
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey: K | undefined;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey !== undefined) {
      const entry = this.cache.get(lruKey);
      this.cache.delete(lruKey);
      this.stats.evictions++;

      if (this.options.onEvict && entry) {
        this.options.onEvict(String(lruKey), entry.value);
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const before = this.cache.size;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);

        if (this.options.onEvict) {
          this.options.onEvict(String(key), entry.value);
        }
      }
    }

    const removed = before - this.cache.size;
    if (removed > 0 && this.logger) {
      this.logger.debug(`Cache cleanup removed ${removed} expired entries`);
    }
  }
}

/**
 * Global cache instances for common use cases
 */
export class GlobalCaches {
  private static objectIdCache = new CacheUtil<string, unknown>({
    maxSize: 1000,
    ttl: 300_000, // 5 minutes
  });

  private static sortCache = new CacheUtil<string, unknown>({
    maxSize: 500,
    ttl: 600_000, // 10 minutes
  });

  private static probeCache = new CacheUtil<string, unknown>({
    maxSize: 200,
    ttl: 900_000, // 15 minutes
  });

  static getObjectIdCache(): CacheUtil<string, unknown> {
    return GlobalCaches.objectIdCache;
  }

  static getSortCache(): CacheUtil<string, unknown> {
    return GlobalCaches.sortCache;
  }

  static getProbeCache(): CacheUtil<string, unknown> {
    return GlobalCaches.probeCache;
  }

  static getAllStats(): Record<string, CacheStats> {
    return {
      objectId: GlobalCaches.objectIdCache.getStats(),
      probe: GlobalCaches.probeCache.getStats(),
      sort: GlobalCaches.sortCache.getStats(),
    };
  }

  static clearAll(): void {
    GlobalCaches.objectIdCache.clear();
    GlobalCaches.sortCache.clear();
    GlobalCaches.probeCache.clear();
  }
}

/**
 * Cache decorator for methods
 */
export function CacheResult<T>(
  options: { ttl?: number; keyGenerator?: (...args: unknown[]) => string } = {},
) {
  const cache = new CacheUtil<string, T>({
    maxSize: 1_000,
    ttl: options.ttl || 300_000,
  });

  return (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const key = options.keyGenerator
        ? options.keyGenerator(...args)
        : `${(target as { constructor: { name: string } }).constructor.name}.${propertyName}.${JSON.stringify(args)}`;

      if (cache.has(key)) {
        return cache.get(key);
      }

      const result = await originalMethod.apply(this, args);
      cache.set(key, result);
      return result;
    };

    return descriptor;
  };
}

/**
 * Distributed cache interface for future Redis integration
 */
export interface DistributedCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Cache key utilities
 */
export class CacheKeyUtil {
  static userKey(userId: string, suffix?: string): string {
    return suffix ? `user:${userId}:${suffix}` : `user:${userId}`;
  }

  static organizationKey(orgId: string, suffix?: string): string {
    return suffix ? `org:${orgId}:${suffix}` : `org:${orgId}`;
  }

  static resourceKey(type: string, id: string, suffix?: string): string {
    return suffix ? `${type}:${id}:${suffix}` : `${type}:${id}`;
  }

  static queryKey(type: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = params[key];
          return acc;
        },
        {} as Record<string, unknown>,
      );

    return `query:${type}:${JSON.stringify(sortedParams)}`;
  }

  static versionedKey(key: string, version: string | number): string {
    return `${key}:v${version}`;
  }
}
