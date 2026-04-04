import type { FetchResult } from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TwitterFetcherService {
  constructor(
    private readonly twitterService: TwitterService,
    private readonly logger: LoggerService,
  ) {}

  async fetchMetrics(
    _organizationId: string,
    _brandId: string,
    posts: Array<{ postId: string; externalId: string }>,
  ): Promise<FetchResult[]> {
    const results: FetchResult[] = [];

    for (const post of posts) {
      try {
        const stats = await this.twitterService.getMediaAnalytics(
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
          `TwitterFetcherService failed for post ${post.postId}`,
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
