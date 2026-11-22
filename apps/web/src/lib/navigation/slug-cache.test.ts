import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlugCache } from './slug-cache';

const TTL_MS = 1_000;
const MAX_ENTRIES = 3;

function createCache() {
  return createSlugCache<{ orgSlug: string }>({
    isValid: (value) => value.orgSlug !== 'invalid',
    maxEntries: MAX_ENTRIES,
    ttlMs: TTL_MS,
  });
}

describe('createSlugCache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not share an entry between two different cookies', async () => {
    const cache = createCache();
    await cache.write('session=a', { orgSlug: 'one' });
    await cache.write('session=b', { orgSlug: 'two' });

    await expect(cache.read('session=a')).resolves.toEqual({ orgSlug: 'one' });
    await expect(cache.read('session=b')).resolves.toEqual({ orgSlug: 'two' });
    await expect(cache.read('session=c')).resolves.toBeNull();
  });

  it('never holds the raw cookie value as a key', async () => {
    const cache = createCache();
    await cache.write('session=secret-value', { orgSlug: 'one' });

    const [key] = cache.keys();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(cache.keys().join()).not.toContain('secret-value');
  });

  it('drops an expired entry on read and on the next write', async () => {
    const cache = createCache();
    await cache.write('session=a', { orgSlug: 'one' });
    await cache.write('session=b', { orgSlug: 'two' });

    vi.advanceTimersByTime(TTL_MS);
    await expect(cache.read('session=a')).resolves.toBeNull();
    expect(cache.keys()).toHaveLength(1);

    await cache.write('session=c', { orgSlug: 'three' });
    expect(cache.keys()).toHaveLength(1);
  });

  it('drops an entry that is no longer valid', async () => {
    const cache = createCache();
    await cache.write('session=a', { orgSlug: 'invalid' });

    await expect(cache.read('session=a')).resolves.toBeNull();
    expect(cache.keys()).toHaveLength(0);
  });

  it('never exceeds the cap and evicts the oldest first', async () => {
    const cache = createCache();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await cache.write(`session=${name}`, { orgSlug: name });
      expect(cache.keys().length).toBeLessThanOrEqual(MAX_ENTRIES);
    }

    await expect(cache.read('session=a')).resolves.toBeNull();
    await expect(cache.read('session=b')).resolves.toBeNull();
    await expect(cache.read('session=e')).resolves.toEqual({ orgSlug: 'e' });
  });
});
