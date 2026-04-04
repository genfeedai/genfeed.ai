import type { FetchResult } from '@api/services/analytics-sync/services/platform-fetchers/youtube-fetcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * TikTok Fetcher — PLACEHOLDER
 * TikTok API requires app review before analytics can be pulled.
 * When approved, integrate with TikTokService.getMediaAnalytics().
 */
@Injectable()
export class TikTokFetcherService {
  constructor(private readonly logger: LoggerService) {}

  async fetchMetrics(
    _organizationId: string,
    _brandId: string,
    posts: Array<{ postId: string; externalId: string }>,
  ): Promise<FetchResult[]> {
    this.logger.warn(
      `TikTokFetcherService: skipping ${posts.length} posts — API not yet approved`,
    );
    return posts.map((post) => ({
      error: 'TikTok API integration pending app review',
      externalId: post.externalId,
      metrics: null,
      postId: post.postId,
    }));
  }
}
