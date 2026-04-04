export interface CacheResult<T> {
  value: T;
  expires: number | null;
}

export class GlobalCaches {
  static readonly default = new Map<string, unknown>();
  static readonly performance = new Map<string, unknown>();
  static readonly metadata = new Map<string, unknown>();

  static clearAll(): void {
    GlobalCaches.default.clear();
    GlobalCaches.performance.clear();
    GlobalCaches.metadata.clear();
  }

  static getAllStats(): { [key: string]: number } {
    return {
      default: GlobalCaches.default.size,
      metadata: GlobalCaches.metadata.size,
      performance: GlobalCaches.performance.size,
    };
  }
}

export class CacheUtil {
  private static cache = new Map<string, unknown>();

  static set(key: string, value: unknown, ttlMs?: number): void {
    CacheUtil.cache.set(key, {
      expires: ttlMs ? Date.now() + ttlMs : null,
      value,
    });
  }

  static get<T = unknown>(key: string): T | null {
    const item = CacheUtil.cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expires && Date.now() > item.expires) {
      CacheUtil.cache.delete(key);
      return null;
    }

    return item.value;
  }

  static has(key: string): boolean {
    const item = CacheUtil.get(key);
    return item !== null;
  }

  static delete(key: string): boolean {
    return CacheUtil.cache.delete(key);
  }

  static clear(): void {
    CacheUtil.cache.clear();
  }

  static size(): number {
    return CacheUtil.cache.size;
  }
}
