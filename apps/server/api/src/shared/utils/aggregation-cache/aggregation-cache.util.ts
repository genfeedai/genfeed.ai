import { createHash } from 'node:crypto';
import { CacheService } from '@api/services/cache/services/cache.service';
import { AggregationOptions } from '@libs/interfaces/query.interface';

export interface AggregationCacheOptions {
  ttl?: number;
  tags?: string[];
  namespace?: string;
}

/**
 * Utility class for caching paginated query results.
 * Previously worked with Mongoose aggregate pipelines; now operates on plain
 * collection names and pre-fetched result data.
 */
export class AggregationCacheUtil {
  /**
   * Generate a unique cache key for a query / aggregation pipeline.
   */
  static generateCacheKey(
    collection: string,
    pipeline: unknown[],
    options?: AggregationOptions,
  ): string {
    const hash = createHash('sha256');
    hash.update(collection);
    hash.update(JSON.stringify(pipeline));
    if (options) {
      hash.update(JSON.stringify(options));
    }
    return `agg:${collection}:${hash.digest('hex')}`;
  }

  /**
   * Invalidate aggregation cache for a collection.
   * Invalidates both `agg:{collection}` and `collection:{collection}` tags.
   */
  static async invalidateCollectionCache(
    cacheService: CacheService,
    collection: string,
  ): Promise<number> {
    const invalidated1 = await cacheService.invalidateByTags([
      `agg:${collection}`,
    ]);
    const invalidated2 = await cacheService.invalidateByTags([
      `collection:${collection}`,
    ]);
    return invalidated1 + invalidated2;
  }

  /**
   * Invalidate all aggregation caches.
   */
  static async invalidateAllAggregationCache(
    cacheService: CacheService,
  ): Promise<number> {
    return await cacheService.invalidateByTags(['agg:paginated']);
  }

  /**
   * Check if a pipeline is cacheable (no user-specific or time-sensitive operations).
   * Kept for backward compatibility with callers that pass MongoDB pipeline arrays.
   */
  static isCacheable(pipeline: unknown[]): boolean {
    const nonCacheableOperators = [
      '$currentDate',
      '$rand',
      '$sample',
      '$$NOW',
      '$$CLUSTER_TIME',
    ];

    const pipelineString = JSON.stringify(pipeline);

    return !nonCacheableOperators.some((operator) =>
      pipelineString.includes(operator),
    );
  }
}
