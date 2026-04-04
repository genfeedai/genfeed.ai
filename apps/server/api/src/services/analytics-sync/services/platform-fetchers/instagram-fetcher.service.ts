import type { FetchResult } from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InstagramFetcherService {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly logger: LoggerService,
  ) {}

  async fetchMetrics(
    organizationId: string,
    brandId: string,
    posts: Array<{ postId: string; externalId: string }>,
  ): Promise<FetchResult[]> {
    const results: FetchResult[] = [];

    for (const post of posts) {
      try {
        const stats = await this.instagramService.getMediaAnalytics(
          organizationId,
          brandId,
          post.externalId,
        );
        results.push({
          externalId: post.externalId,
          metrics: {
            totalComments: stats.comments,
            totalLikes: stats.likes,
            totalSaves: 0,
            totalShares: 0,
            totalViews: stats.views,
          },
          postId: post.postId,
        });
      } catch (error: unknown) {
        this.logger.error(
          `InstagramFetcherService failed for post ${post.postId}`,
          error,
        );
        results.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          externalId: post.externalId,
          metrics: null,
          postId: post.postId,
        });
      }
    }
    return results;
  }
}
