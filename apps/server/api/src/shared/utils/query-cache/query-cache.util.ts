import { createHash } from 'node:crypto';
import { CacheService } from '@api/services/cache/services/cache.service';
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

/** Invalidate all paginated query caches. */
export async function invalidateAllPaginatedQueryCaches(
  cacheService: CacheService,
): Promise<number> {
  return await cacheService.invalidateByTags(['query:paginated']);
}
