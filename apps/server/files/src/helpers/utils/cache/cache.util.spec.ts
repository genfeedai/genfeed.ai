import { CacheUtil, GlobalCaches } from '@files/helpers/utils/cache/cache.util';

describe('CacheUtil', () => {
  afterEach(() => {
    CacheUtil.clear();
    vi.useRealTimers();
  });

  it('sets and gets values', () => {
    CacheUtil.set('key', 'value');

    expect(CacheUtil.get('key')).toBe('value');
  });

  it('returns null for missing keys', () => {
    expect(CacheUtil.get('missing')).toBeNull();
  });

  it('reports key presence correctly', () => {
    CacheUtil.set('present', 'value');

    expect(CacheUtil.has('present')).toBe(true);
    expect(CacheUtil.has('missing')).toBe(false);
  });

  it('removes keys', () => {
    CacheUtil.set('remove', 'value');

    expect(CacheUtil.delete('remove')).toBe(true);
    expect(CacheUtil.get('remove')).toBeNull();
  });

  it('expires values based on ttl', () => {
    vi.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    CacheUtil.set('ttl', 'value', 1000);
    expect(CacheUtil.get('ttl')).toBe('value');

    vi.advanceTimersByTime(1001);

    expect(CacheUtil.get('ttl')).toBeNull();
    expect(CacheUtil.has('ttl')).toBe(false);
  });

  it('returns size of stored entries', () => {
    CacheUtil.set('one', 'value');
    CacheUtil.set('two', 'value');

    expect(CacheUtil.size()).toBe(2);
  });
});

describe('GlobalCaches', () => {
  afterEach(() => {
    GlobalCaches.clearAll();
  });

  it('clears all cache maps', () => {
    GlobalCaches.default.set('a', '1');
    GlobalCaches.performance.set('b', '2');
    GlobalCaches.metadata.set('c', '3');

    GlobalCaches.clearAll();

    expect(GlobalCaches.default.size).toBe(0);
    expect(GlobalCaches.performance.size).toBe(0);
    expect(GlobalCaches.metadata.size).toBe(0);
  });

  it('returns size stats for each cache map', () => {
    GlobalCaches.default.set('a', '1');
    GlobalCaches.performance.set('b', '2');

    const stats = GlobalCaches.getAllStats();

    expect(stats).toEqual({
      default: 1,
      metadata: 0,
      performance: 1,
    });
  });
});
