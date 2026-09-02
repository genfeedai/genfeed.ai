import { createHash } from 'node:crypto';
import { CacheService } from '@api/services/cache/cache.service';
import type { AggregationOptions } from '@libs/interfaces/query.interface';

/** Generate a unique cache key for a paginated query descriptor. */
export function generateQueryCacheKey(
  collection: string,
  query: unknown,
  options?: AggregationOptions,
): string {
  const hash = createHash('sha256');
  hash.update(collection);
  hash.update(JSON.stringify(query));
  if (options) {
    hash.update(JSON.stringify(options));
  }
  return `query:${collection}:${hash.digest('hex')}`;
}

/**
 * Collection-scoped tag applied to (and invalidated for) one collection's
 * paginated `findAll` cache entries. A write to collection X must invalidate
 * only `paginatedQueryCacheTag(X)` — never every collection's paginated
 * cache — otherwise a write to one collection collapses the paginated-list
 * cache hit rate for every other collection.
 */
export function paginatedQueryCacheTag(collection: string): string {
  return `query:paginated:${collection}`;
}

/**
 * Tag applied to every paginated query cache entry across every collection,
 * reserved for deliberate system-wide flushes via
 * `invalidateAllPaginatedQueryCaches`. Per-write invalidation paths (create/
 * patch/remove) must use `paginatedQueryCacheTag(collection)` instead —
 * invalidating this tag on every write is the cross-collection cache
 * stampede that scoping exists to prevent.
 */
export const GLOBAL_PAGINATED_QUERY_CACHE_TAG = 'query:paginated:all';

/** Invalidate query caches for a collection. */
export async function invalidateCollectionQueryCache(
  cacheService: CacheService,
  collection: string,
): Promise<number> {
  const invalidatedAggregation = await cacheService.invalidateByTags([
    `query:${collection}`,
  ]);
  const invalidatedCollection = await cacheService.invalidateByTags([
    `collection:${collection}`,
  ]);
  return invalidatedAggregation + invalidatedCollection;
}

/**
 * Invalidate all paginated query caches across every collection. Reserved
 * for deliberate system-wide flushes — never call this from a per-write
 * path scoped to a single collection.
 */
export async function invalidateAllPaginatedQueryCaches(
  cacheService: CacheService,
): Promise<number> {
  return await cacheService.invalidateByTags([
    GLOBAL_PAGINATED_QUERY_CACHE_TAG,
  ]);
}
