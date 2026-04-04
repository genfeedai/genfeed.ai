import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AggregationCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cacheAggregation(
    namespace: string,
    queryHash: string,
    result: unknown,
    tags: string[] = [],
  ): Promise<boolean> {
    const key = this.cacheService.generateKey(
      'aggregation',
      namespace,
      queryHash,
    );
    return this.cacheService.set(key, result, {
      tags: ['aggregations', ...tags],
      ttl: 180,
    });
  }

  getAggregation<T = unknown>(
    namespace: string,
    queryHash: string,
  ): Promise<T | null> {
    const key = this.cacheService.generateKey(
      'aggregation',
      namespace,
      queryHash,
    );
    return this.cacheService.get<T>(key);
  }

  generateQueryHash(query: unknown): string {
    return Buffer.from(JSON.stringify(query)).toString('base64');
  }
}
