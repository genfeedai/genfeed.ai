import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { CACHE_TAGS } from '@api/common/constants/cache-patterns.constants';
import type { CacheService } from '@api/services/cache/cache.service';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { defer, firstValueFrom, Observable } from 'rxjs';

/**
 * The cache contract the interceptor relies on, held in memory: entries with
 * tags, one epoch per tag, and a store that refuses a value computed before
 * its tags were invalidated (the Redis-backed `CacheService` does the same
 * check atomically, and is covered against a real Redis in
 * `cache-tag-guard.integration.spec.ts`).
 */
class InMemoryTaggedCache {
  readonly entries = new Map<string, { tags: string[]; value: unknown }>();
  private readonly epochs = new Map<string, number>();
  isAvailable = true;

  get = async (key: string): Promise<unknown> =>
    this.entries.get(key)?.value ?? null;

  set = async (
    key: string,
    value: unknown,
    options: { tags?: string[] } = {},
  ): Promise<boolean> => {
    this.entries.set(key, { tags: options.tags ?? [], value });
    return true;
  };

  readTagEpochs = async (tags: string[]): Promise<string[] | null> =>
    this.isAvailable
      ? tags.map((tag) => String(this.epochs.get(tag) ?? 0))
      : null;

  setUnlessTagsInvalidated = async (
    key: string,
    value: unknown,
    options: { tags: string[] },
    epochs: string[],
  ): Promise<boolean> => {
    const isCurrent = options.tags.every(
      (tag, index) => String(this.epochs.get(tag) ?? 0) === epochs[index],
    );
    if (!isCurrent) return false;
    this.entries.set(key, { tags: options.tags, value });
    return true;
  };

  invalidateGuardedTags = async (tags: string[]): Promise<number> => {
    for (const tag of tags)
      this.epochs.set(tag, (this.epochs.get(tag) ?? 0) + 1);
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  };
}

const GUARDED: CacheOptions = {
  isInvalidationGuarded: true,
  keyGenerator: (request) => `public:brand:${request.params?.brandId}`,
  tags: ['brands', CACHE_TAGS.PUBLIC_BRAND_CONTENT],
  ttl: 1800,
};

function setup(options: CacheOptions) {
  const cache = new InMemoryTaggedCache();
  const interceptor = new RedisCacheInterceptor(
    cache as unknown as CacheService,
    { get: () => options } as unknown as Reflector,
  );
  const request = { method: 'GET', params: { brandId: 'brand-1' }, query: {} };
  const context = {
    getClass: () => ({ name: 'PublicBrandsController' }),
    getHandler: () => ({ name: 'findOne' }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  /** One request; `handler` is the controller reading the database. */
  const call = async (handler: () => Promise<unknown>): Promise<unknown> => {
    const next: CallHandler = {
      handle: () => defer(handler) as Observable<unknown>,
    };
    const result = await interceptor.intercept(context, next);
    const value = await firstValueFrom(result);
    // The store runs after the response is built; let it finish.
    await new Promise((resolve) => setImmediate(resolve));
    return value;
  };
  return { cache, call };
}

describe('public response cache and invalidation', () => {
  it('serves a repeat request from the cache until the brand is invalidated', async () => {
    const { cache, call } = setup(GUARDED);
    let brand: string | null = 'visible brand';
    const readBrand = async () => brand;

    expect(await call(readBrand)).toBe('visible brand');
    brand = null; // the brand is deleted
    expect(await call(readBrand)).toBe('visible brand'); // stale hit

    await cache.invalidateGuardedTags([CACHE_TAGS.PUBLIC_BRAND_CONTENT]);

    expect(await call(readBrand)).toBeNull();
  });

  it('does not store a response that was read before a deletion landed', async () => {
    const { cache, call } = setup(GUARDED);
    let brand: string | null = 'visible brand';
    let finishRead: () => void = () => undefined;
    const slowRead = async () => {
      const seen = brand; // the read sees the brand before it is deleted
      await new Promise<void>((resolve) => {
        finishRead = resolve;
      });
      return seen;
    };

    const inFlight = call(slowRead);
    await new Promise((resolve) => setImmediate(resolve));
    brand = null;
    await cache.invalidateGuardedTags([CACHE_TAGS.PUBLIC_BRAND_CONTENT]);
    finishRead();

    expect(await inFlight).toBe('visible brand'); // the racing caller keeps its answer
    expect(cache.entries.size).toBe(0);
    expect(await call(async () => brand)).toBeNull(); // the next caller sees the deletion
  });

  it('stores a response normally when nothing was invalidated meanwhile', async () => {
    const { cache, call } = setup(GUARDED);

    await call(async () => 'visible brand');

    expect(cache.entries.get('public:brand:brand-1')?.value).toBe(
      'visible brand',
    );
  });

  it('does not store a guarded response when the cache cannot vouch for it', async () => {
    const { cache, call } = setup(GUARDED);
    cache.isAvailable = false;

    expect(await call(async () => 'visible brand')).toBe('visible brand');
    expect(cache.entries.size).toBe(0);
  });

  it('keeps storing unguarded responses without consulting the epochs', async () => {
    const { cache, call } = setup({ ...GUARDED, isInvalidationGuarded: false });
    cache.isAvailable = false;

    await call(async () => 'models');

    expect(cache.entries.get('public:brand:brand-1')?.value).toBe('models');
  });
});
