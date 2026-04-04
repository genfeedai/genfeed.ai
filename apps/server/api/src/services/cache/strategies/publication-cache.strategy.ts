import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PublicationCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cachePublications(
    userId: string,
    videoId: string,
    posts: unknown[],
  ): Promise<boolean> {
    const key = this.cacheService.generateKey('posts', userId, videoId);
    return this.cacheService.set(key, posts, {
      tags: ['posts', `user:${userId}`, `video:${videoId}`],
      ttl: 600,
    });
  }

  async getPublications<T = unknown>(
    userId: string,
    videoId: string,
  ): Promise<T[]> {
    const key = this.cacheService.generateKey('posts', userId, videoId);
    return (await this.cacheService.get<T[]>(key)) || [];
  }
}
