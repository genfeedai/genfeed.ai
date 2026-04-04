import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VoteCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cacheVoteCount(
    entityId: string,
    entityModel: string,
    count: number,
  ): Promise<boolean> {
    const key = this.cacheService.generateKey('votes', entityModel, entityId);
    return this.cacheService.set(
      key,
      { count, lastUpdated: Date.now() },
      {
        tags: ['votes', `${entityModel.toLowerCase()}:${entityId}`],
        ttl: 120,
      },
    );
  }

  async getVoteCount(
    entityId: string,
    entityModel: string,
  ): Promise<number | null> {
    const key = this.cacheService.generateKey('votes', entityModel, entityId);
    const cached = await this.cacheService.get<{
      count: number;
      lastUpdated: number;
    }>(key);
    return cached ? cached.count : null;
  }

  invalidate(entityId: string): Promise<number> {
    return this.cacheService.invalidateByTags([`votes:${entityId}`]);
  }
}
