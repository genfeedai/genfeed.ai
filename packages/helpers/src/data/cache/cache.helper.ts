interface CacheEntry<T> {
  data: T;
  expires: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CacheConfig {
  prefix?: string;
  maxSize?: number;
  onSet?: (key: string, value: unknown) => void;
  onGet?: (key: string, value: unknown) => void;
  onRemove?: (key: string) => void;
}

export class MemoryCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly ttlMs: number = 5 * 60 * 1000,
    private readonly maxSize: number = 1000,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, customTtlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const ttl = customTtlMs ?? this.ttlMs;
    this.cache.set(key, {
      expiry: Date.now() + ttl,
      value,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

let globalCache: MemoryCache<unknown> | null = null;
let cacheHits = 0;
let cacheMisses = 0;

export function createCacheKey(...parts: unknown[]): string {
  return parts
    .map((part) => {
      if (part === null || part === undefined) {
        return 'null';
      }
      if (typeof part === 'object') {
        return JSON.stringify(part);
      }
      return String(part);
    })
    .join(':');
}

function getGlobalCache(): MemoryCache<unknown> {
  if (!globalCache) {
    globalCache = new MemoryCache();
  }
  return globalCache;
}

export function setCacheItem<T>(
  key: string,
  data: T,
  ttlMs: number = 300000,
): void {
  const cache = getGlobalCache();
  cache.set(key, data, ttlMs);
}

export function getCacheItem<T>(key: string): T | null {
  const cache = getGlobalCache();
  const value = cache.get(key);

  if (value === undefined) {
    cacheMisses++;
    return null;
  }

  cacheHits++;
  return value as T;
}

export function removeCacheItem(key: string): void {
  const cache = getGlobalCache();
  cache.delete(key);
}

export function clearCache(): void {
  const cache = getGlobalCache();
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function isCacheExpired(expires: number): boolean {
  return Date.now() > expires;
}

export function pruneExpiredItems(): void {}

export function getCacheStats(): CacheStats {
  const cache = getGlobalCache();
  const size = (cache as unknown as { cache: Map<unknown, unknown> }).cache
    .size;

  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;

  return {
    hitRate,
    hits: cacheHits,
    misses: cacheMisses,
    size,
  };
}

export function createMemoryCache<T = unknown>(
  config?: CacheConfig,
): {
  get: (key: string) => T | null;
  set: (key: string, value: T, ttlMs?: number) => void;
  remove: (key: string) => void;
  clear: () => void;
} {
  const prefix = config?.prefix || 'cache:';
  const maxSize = config?.maxSize || 1000;
  const cache = new MemoryCache<T>(300000, maxSize);

  return {
    clear: () => {
      cache.clear();
    },
    get: (key: string) => {
      const value = cache.get(`${prefix}${key}`);
      config?.onGet?.(key, value as T);
      return (value ?? null) as T | null;
    },
    remove: (key: string) => {
      cache.delete(`${prefix}${key}`);
      config?.onRemove?.(key);
    },
    set: (key: string, value: T, ttlMs?: number) => {
      cache.set(`${prefix}${key}`, value, ttlMs);
      config?.onSet?.(key, value);
    },
  };
}

export function createLocalStorageCache<T = unknown>(
  config?: CacheConfig,
): {
  get: (key: string) => T | null;
  set: (key: string, value: T, ttlMs?: number) => void;
  remove: (key: string) => void;
  clear: () => void;
} {
  const prefix = config?.prefix || 'cache:';

  return {
    clear: () => {
      if (prefix === 'cache:') {
        // If using default prefix, clear all localStorage
        localStorage.clear();
      } else {
        // Otherwise, only clear items with the specific prefix
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });
      }
    },
    get: (key: string) => {
      try {
        const stored = localStorage.getItem(`${prefix}${key}`);
        if (!stored) {
          config?.onGet?.(key, null);
          return null;
        }

        const entry: CacheEntry<T> = JSON.parse(stored);

        if (isCacheExpired(entry.expires)) {
          localStorage.removeItem(`${prefix}${key}`);
          return null;
        }

        config?.onGet?.(key, entry.data);
        return entry.data;
      } catch {
        return null;
      }
    },
    remove: (key: string) => {
      localStorage.removeItem(`${prefix}${key}`);
      config?.onRemove?.(key);
    },
    set: (key: string, value: T, ttlMs: number = 300000) => {
      try {
        const entry: CacheEntry<T> = {
          data: value,
          expires: Date.now() + ttlMs,
        };
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(entry));
        config?.onSet?.(key, value);
      } catch {
        // Silently fail if localStorage is unavailable or quota exceeded
      }
    },
  };
}

export function createSessionStorageCache<T = unknown>(
  config?: CacheConfig,
): {
  get: (key: string) => T | null;
  set: (key: string, value: T, ttlMs?: number) => void;
  remove: (key: string) => void;
  clear: () => void;
} {
  const prefix = config?.prefix || 'cache:';

  return {
    clear: () => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        sessionStorage.removeItem(key);
      });
    },
    get: (key: string) => {
      try {
        const stored = sessionStorage.getItem(`${prefix}${key}`);
        if (!stored) {
          config?.onGet?.(key, null);
          return null;
        }

        const entry: CacheEntry<T> = JSON.parse(stored);

        if (isCacheExpired(entry.expires)) {
          sessionStorage.removeItem(`${prefix}${key}`);
          return null;
        }

        config?.onGet?.(key, entry.data);
        return entry.data;
      } catch {
        return null;
      }
    },
    remove: (key: string) => {
      sessionStorage.removeItem(`${prefix}${key}`);
      config?.onRemove?.(key);
    },
    set: (key: string, value: T, ttlMs: number = 300000) => {
      try {
        const entry: CacheEntry<T> = {
          data: value,
          expires: Date.now() + ttlMs,
        };
        sessionStorage.setItem(`${prefix}${key}`, JSON.stringify(entry));
        config?.onSet?.(key, value);
      } catch {
        // Silently fail if sessionStorage is unavailable
      }
    },
  };
}

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly maxTokens: number = 10,
    private readonly refillRate: number = 1,
    private readonly ttlMs: number = 60 * 60 * 1000,
  ) {}

  consume(key: string, tokens: number = 1): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { lastRefill: now, tokens: this.maxTokens };
      this.buckets.set(key, bucket);
    }

    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timePassed / 1000) * this.refillRate);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > this.ttlMs) {
        this.buckets.delete(key);
      }
    }
  }
}
