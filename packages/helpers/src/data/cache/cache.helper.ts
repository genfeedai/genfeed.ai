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

  size(): number {
    return this.cache.size;
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

export function isCacheExpired(expires: number): boolean {
  return Date.now() > expires;
}

type BrowserStorageCache<T> = {
  get: (key: string) => T | null;
  set: (key: string, value: T, ttlMs?: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

function clearStorageByPrefix(storage: Storage, prefix: string): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => {
    storage.removeItem(key);
  });
}

/**
 * Accepts a lazy `getStorage` factory so that `localStorage` / `sessionStorage`
 * are only dereferenced inside method calls (browser runtime), never at module
 * evaluation time. This prevents Next.js SSR / prerender from throwing
 * `ReferenceError: localStorage is not defined` when a cache is created at
 * module scope.
 */
function createBrowserStorageCache<T = unknown>(
  getStorage: () => Storage,
  config?: CacheConfig,
  clearDefaultPrefix = false,
): BrowserStorageCache<T> {
  const prefix = config?.prefix || 'cache:';

  return {
    clear: () => {
      const storage = getStorage();
      if (clearDefaultPrefix && prefix === 'cache:') {
        storage.clear();
        return;
      }

      clearStorageByPrefix(storage, prefix);
    },
    get: (key: string) => {
      try {
        const storage = getStorage();
        const stored = storage.getItem(`${prefix}${key}`);
        if (!stored) {
          config?.onGet?.(key, null);
          return null;
        }

        const entry: CacheEntry<T> = JSON.parse(stored);

        if (isCacheExpired(entry.expires)) {
          storage.removeItem(`${prefix}${key}`);
          return null;
        }

        config?.onGet?.(key, entry.data);
        return entry.data;
      } catch {
        return null;
      }
    },
    remove: (key: string) => {
      const storage = getStorage();
      storage.removeItem(`${prefix}${key}`);
      config?.onRemove?.(key);
    },
    set: (key: string, value: T, ttlMs: number = 300000) => {
      try {
        const storage = getStorage();
        const entry: CacheEntry<T> = {
          data: value,
          expires: Date.now() + ttlMs,
        };
        storage.setItem(`${prefix}${key}`, JSON.stringify(entry));
        config?.onSet?.(key, value);
      } catch {
        // Silently fail if browser storage is unavailable or quota exceeded.
      }
    },
  };
}

export function createLocalStorageCache<T = unknown>(
  config?: CacheConfig,
): BrowserStorageCache<T> {
  return createBrowserStorageCache<T>(() => localStorage, config, true);
}
