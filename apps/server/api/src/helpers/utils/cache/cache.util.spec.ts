import {
  CacheKeyUtil,
  CacheUtil,
  GlobalCaches,
} from '@api/helpers/utils/cache/cache.util';

describe('CacheUtil', () => {
  let cache: CacheUtil<string, any>;

  beforeEach(() => {
    cache = new CacheUtil({
      maxSize: 3,
      ttl: 1000, // 1 second for testing
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('TTL functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      await vi.advanceTimersByTimeAsync(1100);

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('should support custom TTL per entry', async () => {
      cache.set('key1', 'value1', 500); // 0.5 seconds
      cache.set('key2', 'value2', 1500); // 1.5 seconds

      await vi.advanceTimersByTimeAsync(600);

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('size limit and eviction', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('should evict least recently used when size limit exceeded', async () => {
      // Fill cache to max size with slight delays to ensure distinct timestamps
      cache.set('key1', 'value1');
      await vi.advanceTimersByTimeAsync(5);
      cache.set('key2', 'value2');
      await vi.advanceTimersByTimeAsync(5);
      cache.set('key3', 'value3');

      // Access key1 and key3 to make them recently used, leaving key2 as LRU
      cache.get('key1');
      cache.get('key3');

      // Add new key, should evict key2 (least recently used)
      cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should call onEvict callback when evicting', () => {
      const onEvict = vi.fn();
      const cacheWithCallback = new CacheUtil({
        maxSize: 2,
        onEvict,
      });

      cacheWithCallback.set('key1', 'value1');
      cacheWithCallback.set('key2', 'value2');
      cacheWithCallback.set('key3', 'value3'); // Should evict key1

      expect(onEvict).toHaveBeenCalledWith('key1', 'value1');
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667);
    });

    it('should track evictions', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should cause eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('memoization', () => {
    it('should memoize function results', () => {
      const fn = vi.fn((x: number) => x * 2);
      const memoized = cache.memoize(fn);

      expect(memoized(5)).toBe(10);
      expect(memoized(5)).toBe(10); // Should use cached result
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle async functions', async () => {
      const asyncFn = vi.fn(async (x: number) => {
        await Promise.resolve();
        return x * 2;
      });

      const memoized = cache.memoize(asyncFn);

      const result1 = await memoized(5);
      const result2 = await memoized(5);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(asyncFn).toHaveBeenCalledTimes(1);
    });

    it('should use custom key generator', () => {
      const fn = vi.fn((obj: { id: number }) => obj.id * 2);
      const memoized = cache.memoize(fn, (obj) => `id_${obj.id}`);

      void memoized({ id: 5 });
      void memoized({ id: 5 });

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('GlobalCaches', () => {
  afterEach(() => {
    GlobalCaches.clearAll();
  });

  it('should provide access to global cache instances', () => {
    const objectIdCache = GlobalCaches.getObjectIdCache();
    const sortCache = GlobalCaches.getSortCache();
    const probeCache = GlobalCaches.getProbeCache();

    expect(objectIdCache).toBeInstanceOf(CacheUtil);
    expect(sortCache).toBeInstanceOf(CacheUtil);
    expect(probeCache).toBeInstanceOf(CacheUtil);
  });

  it('should return same instances on multiple calls', () => {
    const cache1 = GlobalCaches.getObjectIdCache();
    const cache2 = GlobalCaches.getObjectIdCache();

    expect(cache1).toBe(cache2);
  });

  it('should provide combined statistics', () => {
    const objectIdCache = GlobalCaches.getObjectIdCache();
    objectIdCache.set('test', 'value');
    objectIdCache.get('test');

    const stats = GlobalCaches.getAllStats();

    expect(stats).toHaveProperty('objectId');
    expect(stats).toHaveProperty('sort');
    expect(stats).toHaveProperty('probe');
    expect(stats.objectId.hits).toBe(1);
  });
});

describe('CacheKeyUtil', () => {
  it('should generate user keys', () => {
    expect(CacheKeyUtil.userKey('123')).toBe('user:123');
    expect(CacheKeyUtil.userKey('123', 'profile')).toBe('user:123:profile');
  });

  it('should generate organization keys', () => {
    expect(CacheKeyUtil.organizationKey('456')).toBe('org:456');
    expect(CacheKeyUtil.organizationKey('456', 'settings')).toBe(
      'org:456:settings',
    );
  });

  it('should generate resource keys', () => {
    expect(CacheKeyUtil.resourceKey('video', '789')).toBe('video:789');
    expect(CacheKeyUtil.resourceKey('video', '789', 'metadata')).toBe(
      'video:789:metadata',
    );
  });

  it('should generate query keys with sorted parameters', () => {
    const params = { a: 1, b: 2, c: 3 };
    const key = CacheKeyUtil.queryKey('videos', params);

    expect(key).toBe('query:videos:{"a":1,"b":2,"c":3}');
  });

  it('should generate versioned keys', () => {
    expect(CacheKeyUtil.versionedKey('data', '1.0')).toBe('data:v1.0');
    expect(CacheKeyUtil.versionedKey('data', 2)).toBe('data:v2');
  });
});
