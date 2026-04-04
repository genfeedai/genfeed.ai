import { createHash } from 'node:crypto';
import { CacheService } from '@api/services/cache/services/cache.service';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import type { PipelineStage } from 'mongoose';

type AggregationModelLike = {
  aggregate: (pipeline: PipelineStage[]) => { exec: () => Promise<unknown[]> };
  aggregatePaginate: (
    aggregate: { exec: () => Promise<unknown[]> },
    options: AggregationOptions,
  ) => Promise<unknown>;
  collection: {
    name: string;
  };
};

export interface AggregationCacheOptions {
  ttl?: number;
  tags?: string[];
  namespace?: string;
}

/**
 * Utility class for caching MongoDB aggregation pipelines
 */
export class AggregationCacheUtil {
  /**
   * Generate a unique cache key for an aggregation pipeline
   */
  static generateCacheKey(
    collection: string,
    pipeline: PipelineStage[],
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
   * Execute aggregation with caching
   */
  static async executeWithCache<T>(
    model: AggregationModelLike,
    pipeline: PipelineStage[],
    cacheService: CacheService,
    options: AggregationCacheOptions = {},
  ): Promise<T[]> {
    const collection = model.collection.name;
    const cacheKey = AggregationCacheUtil.generateCacheKey(
      options.namespace || collection,
      pipeline,
    );

    // Try to get from cache
    const cached = await cacheService.get<T[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute aggregation
    const result = (await model.aggregate(pipeline).exec()) as T[];

    // Cache the result
    await cacheService.set(cacheKey, result, {
      tags: options.tags || [`agg:${collection}`],
      ttl: options.ttl || 300, // Default 5 minutes
    });

    return result;
  }

  /**
   * Execute paginated aggregation with caching
   */
  static async executePaginatedWithCache(
    model: AggregationModelLike,
    pipeline: PipelineStage[],
    paginateOptions: AggregationOptions,
    cacheService: CacheService,
    options: AggregationCacheOptions = {},
  ): Promise<unknown> {
    const collection = model.collection.name;
    const cacheKey = AggregationCacheUtil.generateCacheKey(
      options.namespace || collection,
      pipeline,
      paginateOptions,
    );

    // Try to get from cache
    const cached = await cacheService.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute paginated aggregation
    const agg = model.aggregate(pipeline);
    const result = await model.aggregatePaginate(agg, paginateOptions);

    // Cache the result
    await cacheService.set(cacheKey, result, {
      tags: options.tags || [`agg:${collection}`, `agg:paginated`],
      ttl: options.ttl || 300, // Default 5 minutes
    });

    return result;
  }

  /**
   * Invalidate aggregation cache for a collection
   * Invalidates both agg:collection and collection:collection tags
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
   * Invalidate all aggregation caches
   * Invalidates both agg:paginated and all collection: tags
   */
  static async invalidateAllAggregationCache(
    cacheService: CacheService,
  ): Promise<number> {
    return await cacheService.invalidateByTags(['agg:paginated']);
  }

  /**
   * Check if pipeline is cacheable (no user-specific or time-sensitive operations)
   */
  static isCacheable(pipeline: PipelineStage[]): boolean {
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

  /**
   * Extract filter criteria from pipeline for smart cache invalidation
   */
  static extractFilterCriteria(pipeline: PipelineStage[]): unknown {
    const filters: Record<string, unknown> = {};

    for (const stage of pipeline) {
      if ('$match' in stage) {
        Object.assign(filters, stage.$match);
      }
    }

    return filters;
  }
}
