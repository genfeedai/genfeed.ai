import {
  clearCache,
  createCacheKey,
  createMemoryCache,
  getCacheItem,
  getCacheStats,
  isCacheExpired,
  MemoryCache,
  RateLimiter,
  removeCacheItem,
  setCacheItem,
} from '@helpers/data/cache/cache.helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── MemoryCache ─────────────────────────────────────────────────────────────

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MemoryCache<string>(1000, 10); // 1 s TTL, 10 max
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  it('stores and retrieves a value', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for a missing key', () => {
    expect(cache.get('ghost')).toBeUndefined();
  });

  it('returns undefined after TTL expires', () => {
    cache.set('k', 'v');
    vi.advanceTimersByTime(2000);
    expect(cache.get('k')).toBeUndefined();
  });

  it('respects custom TTL per entry', () => {
    cache.set('short', 's', 500);
    cache.set('long', 'l', 5000);
    vi.advanceTimersByTime(800);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('l');
  });

  it('reports has() correctly', () => {
    cache.set('present', 'yes');
    expect(cache.has('present')).toBe(true);
    expect(cache.has('absent')).toBe(false);
  });

  it('deletes a specific key', () => {
    cache.set('del', 'me');
    expect(cache.delete('del')).toBe(true);
    expect(cache.get('del')).toBeUndefined();
  });

  it('clears all keys', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('evicts oldest entry when maxSize is reached', () => {
    const small = new MemoryCache<number>(60000, 3);
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3);
    small.set('d', 4); // 'a' should be evicted
    expect(small.get('a')).toBeUndefined();
    expect(small.get('d')).toBe(4);
    small.destroy();
  });
});

// ─── createCacheKey ───────────────────────────────────────────────────────────

describe('createCacheKey', () => {
  it('joins primitive parts with ":"', () => {
    expect(createCacheKey('user', 42, true)).toBe('user:42:true');
  });

  it('serialises object parts as JSON', () => {
    const key = createCacheKey('posts', { limit: 10, page: 1 });
    expect(key).toBe('posts:{"limit":10,"page":1}');
  });

  it('converts null / undefined to "null"', () => {
    expect(createCacheKey(null, undefined)).toBe('null:null');
  });
});

// ─── Global cache helpers ─────────────────────────────────────────────────────

describe('setCacheItem / getCacheItem', () => {
  beforeEach(() => clearCache());

  it('sets and retrieves an item', () => {
    setCacheItem('foo', { bar: 1 });
    expect(getCacheItem('foo')).toEqual({ bar: 1 });
  });

  it('returns null for a missing key', () => {
    expect(getCacheItem('missing')).toBeNull();
  });

  it('removeCacheItem removes the entry', () => {
    setCacheItem('del', 'val');
    removeCacheItem('del');
    expect(getCacheItem('del')).toBeNull();
  });

  it('tracks hits and misses in getCacheStats', () => {
    clearCache();
    setCacheItem('hit', 1);
    getCacheItem('hit'); // hit
    getCacheItem('miss'); // miss
    const stats = getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it('clearCache resets stats', () => {
    setCacheItem('x', 1);
    getCacheItem('x');
    clearCache();
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
  });
});

// ─── isCacheExpired ───────────────────────────────────────────────────────────

describe('isCacheExpired', () => {
  it('returns true for a timestamp in the past', () => {
    expect(isCacheExpired(Date.now() - 1000)).toBe(true);
  });

  it('returns false for a timestamp in the future', () => {
    expect(isCacheExpired(Date.now() + 10000)).toBe(false);
  });
});

// ─── createMemoryCache ────────────────────────────────────────────────────────

describe('createMemoryCache', () => {
  it('stores and retrieves with prefix', () => {
    const c = createMemoryCache<number>({ prefix: 'pfx:' });
    c.set('count', 5);
    expect(c.get('count')).toBe(5);
  });

  it('returns null for missing key', () => {
    const c = createMemoryCache<string>();
    expect(c.get('nope')).toBeNull();
  });

  it('calls onSet callback', () => {
    const onSet = vi.fn();
    const c = createMemoryCache<string>({ onSet });
    c.set('k', 'v');
    expect(onSet).toHaveBeenCalledWith('k', 'v');
  });

  it('calls onGet callback on hit', () => {
    const onGet = vi.fn();
    const c = createMemoryCache<string>({ onGet });
    c.set('k', 'v');
    c.get('k');
    expect(onGet).toHaveBeenCalledWith('k', 'v');
  });

  it('calls onRemove callback', () => {
    const onRemove = vi.fn();
    const c = createMemoryCache<string>({ onRemove });
    c.set('k', 'v');
    c.remove('k');
    expect(onRemove).toHaveBeenCalledWith('k');
    expect(c.get('k')).toBeNull();
  });

  it('clear() empties the cache', () => {
    const c = createMemoryCache<number>();
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.get('a')).toBeNull();
    expect(c.get('b')).toBeNull();
  });
});

// ─── RateLimiter ─────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows consumption within the token budget', () => {
    const limiter = new RateLimiter(5, 1);
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
    expect(limiter.consume('user1')).toBe(true);
  });

  it('rejects when tokens are exhausted', () => {
    const limiter = new RateLimiter(2, 0); // no refill
    limiter.consume('u');
    limiter.consume('u');
    expect(limiter.consume('u')).toBe(false);
  });

  it('refills tokens over time', () => {
    const limiter = new RateLimiter(2, 1); // refill 1 token/s
    limiter.consume('u');
    limiter.consume('u');
    expect(limiter.consume('u')).toBe(false);
    vi.advanceTimersByTime(2000); // +2 tokens
    expect(limiter.consume('u')).toBe(true);
  });

  it('resets a key', () => {
    const limiter = new RateLimiter(1, 0);
    limiter.consume('u');
    expect(limiter.consume('u')).toBe(false);
    limiter.reset('u');
    expect(limiter.consume('u')).toBe(true);
  });

  it('tracks separate budgets per key', () => {
    const limiter = new RateLimiter(1, 0);
    limiter.consume('a');
    expect(limiter.consume('b')).toBe(true); // 'b' is fresh
    expect(limiter.consume('a')).toBe(false);
  });
});
