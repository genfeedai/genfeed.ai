import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PlatformMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
}

export interface FetchResult {
  postId: string;
  externalId: string;
  metrics: PlatformMetrics | null;
  error?: string;
}

@Injectable()
export class YouTubeFetcherService {
  constructor(
    private readonly youtubeAnalyticsService: YoutubeAnalyticsService,
    private readonly logger: LoggerService,
  ) {}

  async fetchMetrics(
    organizationId: string,
    brandId: string,
    posts: Array<{ postId: string; externalId: string }>,
  ): Promise<FetchResult[]> {
    const results: FetchResult[] = [];
    if (posts.length === 0) {
      return results;
    }

    try {
      const batchSize = 50;
      for (let i = 0; i < posts.length; i += batchSize) {
        const batch = posts.slice(i, i + batchSize);
        const videoIds = batch.map((p) => p.externalId);
        const metricsMap =
          await this.youtubeAnalyticsService.getMediaAnalyticsBatch(
            organizationId,
            brandId,
            videoIds,
          );

        for (const post of batch) {
          const stats = metricsMap.get(post.externalId);
          results.push(
            stats
              ? {
                  externalId: post.externalId,
                  metrics: {
                    totalComments: stats.comments,
                    totalLikes: stats.likes,
                    totalSaves: 0,
                    totalShares: 0,
                    totalViews: stats.views,
                  },
                  postId: post.postId,
                }
              : {
                  error: 'No stats returned',
                  externalId: post.externalId,
                  metrics: null,
                  postId: post.postId,
                },
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error('YouTubeFetcherService fetchMetrics failed', error);
      for (const post of posts) {
        if (!results.find((r) => r.postId === post.postId)) {
          results.push({
            error: error instanceof Error ? error.message : 'Unknown error',
            externalId: post.externalId,
            metrics: null,
            postId: post.postId,
          });
        }
      }
    }
    return results;
  }
}
