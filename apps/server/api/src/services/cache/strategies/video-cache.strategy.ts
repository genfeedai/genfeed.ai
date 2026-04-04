import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoCacheStrategy {
  constructor(private readonly cacheService: CacheService) {}

  cacheVideoList(
    userId: string,
    filters: Record<string, unknown>,
    page: number,
    limit: number,
    videos: unknown[],
  ): Promise<boolean> {
    const key = this.generateVideoListKey(userId, filters, page, limit);
    return this.cacheService.set(key, videos, {
      tags: ['videos', `user:${userId}`, 'video-lists'],
      ttl: 300,
    });
  }

  async getVideoList<T = unknown>(
    userId: string,
    filters: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<T[]> {
    const key = this.generateVideoListKey(userId, filters, page, limit);
    return (await this.cacheService.get<T[]>(key)) || [];
  }

  cacheVideo(
    videoId: string,
    videoData: { user: string; brand: string } & Record<string, unknown>,
  ): Promise<boolean> {
    const key = this.cacheService.generateKey('video', videoId);
    return this.cacheService.set(key, videoData, {
      tags: [
        'videos',
        `video:${videoId}`,
        `user:${videoData.user}`,
        `brand:${videoData.brand}`,
      ],
      ttl: 900,
    });
  }

  getVideo<T = unknown>(videoId: string): Promise<T | null> {
    const key = this.cacheService.generateKey('video', videoId);
    return this.cacheService.get<T>(key);
  }

  invalidateVideo(videoId: string): Promise<number> {
    return this.cacheService.invalidateByTags([`video:${videoId}`]);
  }

  invalidateVideoLists(userId?: string): Promise<number> {
    const tags = ['video-lists'];
    if (userId) {
      tags.push(`user:${userId}`);
    }
    return this.cacheService.invalidateByTags(tags);
  }

  private generateVideoListKey(
    userId: string,
    filters: Record<string, unknown>,
    page: number,
    limit: number,
  ): string {
    const filterStr = Object.keys(filters)
      .sort()
      .map((key) => `${key}:${String(filters[key])}`)
      .join(',');

    return this.cacheService.generateKey(
      'video-list',
      userId,
      filterStr,
      page.toString(),
      limit.toString(),
    );
  }
}
