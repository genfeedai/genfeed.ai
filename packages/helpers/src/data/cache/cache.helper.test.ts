import {
  createCacheKey,
  createLocalStorageCache,
  isCacheExpired,
  MemoryCache,
} from '@helpers/data/cache/cache.helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } as Storage;
}

function setBrowserStorage(
  name: 'localStorage' | 'sessionStorage',
  storage: Storage,
): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
    writable: true,
  });
}

function restoreBrowserStorage(
  name: 'localStorage' | 'sessionStorage',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
}

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

  it('reports current size', () => {
    expect(cache.size()).toBe(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size()).toBe(2);
    cache.delete('a');
    expect(cache.size()).toBe(1);
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

describe('isCacheExpired', () => {
  it('returns true for a timestamp in the past', () => {
    expect(isCacheExpired(Date.now() - 1000)).toBe(true);
  });

  it('returns false for a timestamp in the future', () => {
    expect(isCacheExpired(Date.now() + 10000)).toBe(false);
  });
});

describe('browser storage caches', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  const originalSessionStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage',
  );

  afterEach(() => {
    restoreBrowserStorage('localStorage', originalLocalStorage);
    restoreBrowserStorage('sessionStorage', originalSessionStorage);
  });

  it('stores, reads, expires, and removes localStorage entries with callbacks', () => {
    const storage = createStorage();
    const onGet = vi.fn();
    const onRemove = vi.fn();
    const onSet = vi.fn();
    setBrowserStorage('localStorage', storage);

    const cache = createLocalStorageCache<string>({ onGet, onRemove, onSet });

    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
    expect(onSet).toHaveBeenCalledWith('key', 'value');
    expect(onGet).toHaveBeenCalledWith('key', 'value');

    cache.set('expired', 'stale', -1);
    expect(cache.get('expired')).toBeNull();
    expect(storage.getItem('cache:expired')).toBeNull();

    cache.remove('key');
    expect(onRemove).toHaveBeenCalledWith('key');
    expect(cache.get('key')).toBeNull();
  });

  it('clears all localStorage entries only for the default prefix', () => {
    const storage = createStorage();
    setBrowserStorage('localStorage', storage);
    storage.setItem('cache:one', '1');
    storage.setItem('other:two', '2');

    createLocalStorageCache().clear();
    expect(storage.length).toBe(0);

    storage.setItem('custom:one', '1');
    storage.setItem('other:two', '2');
    createLocalStorageCache({ prefix: 'custom:' }).clear();

    expect(storage.getItem('custom:one')).toBeNull();
    expect(storage.getItem('other:two')).toBe('2');
  });

  // Regression: createLocalStorageCache/createSessionStorageCache are sometimes
  // invoked at module scope (e.g. useDiscoveryTrends.ts), which runs during
  // Next.js SSR/prerender where `localStorage` is not defined. The factory must
  // defer the storage lookup to the method calls so construction never throws.
  it('does not touch localStorage at construction time (SSR-safe)', () => {
    restoreBrowserStorage('localStorage', undefined); // simulate server: no global
    expect(() => createLocalStorageCache({ prefix: 'trends:' })).not.toThrow();
  });
});
