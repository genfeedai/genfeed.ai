import { AggregationCacheStrategy } from '@api/services/cache/strategies/aggregation-cache.strategy';
import { BrandCacheStrategy } from '@api/services/cache/strategies/brand-cache.strategy';
import { PublicationCacheStrategy } from '@api/services/cache/strategies/publication-cache.strategy';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { VideoCacheStrategy } from '@api/services/cache/strategies/video-cache.strategy';
import { VoteCacheStrategy } from '@api/services/cache/strategies/vote-cache.strategy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheStrategies {
  constructor(
    private readonly userCacheStrategy: UserCacheStrategy,
    private readonly brandCacheStrategy: BrandCacheStrategy,
    private readonly videoCacheStrategy: VideoCacheStrategy,
    private readonly voteCacheStrategy: VoteCacheStrategy,
    private readonly publicationCacheStrategy: PublicationCacheStrategy,
    private readonly aggregationCacheStrategy: AggregationCacheStrategy,
  ) {}

  cacheUser(userId: string, userData: unknown): Promise<boolean> {
    return this.userCacheStrategy.cacheUser(userId, userData);
  }

  getUser<T = unknown>(userId: string): Promise<T | null> {
    return this.userCacheStrategy.getUser<T>(userId);
  }

  invalidateUserData(userId: string): Promise<number> {
    return this.userCacheStrategy.invalidate(userId);
  }

  cacheBrand(
    brandId: string,
    brandData: { user: string } & Record<string, unknown>,
  ): Promise<boolean> {
    return this.brandCacheStrategy.cacheBrand(brandId, brandData);
  }

  getBrand<T = unknown>(brandId: string): Promise<T | null> {
    return this.brandCacheStrategy.getBrand<T>(brandId);
  }

  invalidateBrandData(brandId: string): Promise<number> {
    return this.brandCacheStrategy.invalidate(brandId);
  }

  cacheVideoList(
    userId: string,
    filters: Record<string, unknown>,
    page: number,
    limit: number,
    videos: unknown[],
  ): Promise<boolean> {
    return this.videoCacheStrategy.cacheVideoList(
      userId,
      filters,
      page,
      limit,
      videos,
    );
  }

  getVideoList<T = unknown>(
    userId: string,
    filters: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<T[]> {
    return this.videoCacheStrategy.getVideoList<T>(
      userId,
      filters,
      page,
      limit,
    );
  }

  cacheVideo(
    videoId: string,
    videoData: { user: string; brand: string } & Record<string, unknown>,
  ): Promise<boolean> {
    return this.videoCacheStrategy.cacheVideo(videoId, videoData);
  }

  getVideo<T = unknown>(videoId: string): Promise<T | null> {
    return this.videoCacheStrategy.getVideo<T>(videoId);
  }

  invalidateVideoData(videoId: string): Promise<number> {
    return this.videoCacheStrategy.invalidateVideo(videoId);
  }

  invalidateVideoLists(userId?: string): Promise<number> {
    return this.videoCacheStrategy.invalidateVideoLists(userId);
  }

  cacheVoteCount(
    entityId: string,
    entityModel: string,
    count: number,
  ): Promise<boolean> {
    return this.voteCacheStrategy.cacheVoteCount(entityId, entityModel, count);
  }

  getVoteCount(entityId: string, entityModel: string): Promise<number | null> {
    return this.voteCacheStrategy.getVoteCount(entityId, entityModel);
  }

  invalidateVotes(entityId: string): Promise<number> {
    return this.voteCacheStrategy.invalidate(entityId);
  }

  cachePosts(
    userId: string,
    videoId: string,
    posts: unknown[],
  ): Promise<boolean> {
    return this.publicationCacheStrategy.cachePublications(
      userId,
      videoId,
      posts,
    );
  }

  getPublications<T = unknown>(userId: string, videoId: string): Promise<T[]> {
    return this.publicationCacheStrategy.getPublications<T>(userId, videoId);
  }

  cacheAggregation(
    namespace: string,
    queryHash: string,
    result: unknown,
    tags: string[] = [],
  ): Promise<boolean> {
    return this.aggregationCacheStrategy.cacheAggregation(
      namespace,
      queryHash,
      result,
      tags,
    );
  }

  getAggregation<T = unknown>(
    namespace: string,
    queryHash: string,
  ): Promise<T | null> {
    return this.aggregationCacheStrategy.getAggregation<T>(
      namespace,
      queryHash,
    );
  }

  generateQueryHash(query: unknown): string {
    return this.aggregationCacheStrategy.generateQueryHash(query);
  }
}
