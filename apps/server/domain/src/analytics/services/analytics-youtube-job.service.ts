import type { YouTubeAnalyticsJobData } from '@genfeedai/queue-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_DOMAIN_TOKENS,
  type ServerDomainLogger,
  type ServerDomainPostAnalytics,
  type ServerDomainYouTubeAnalytics,
} from '@server-domain/server-domain.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';

@Injectable()
export class AnalyticsYouTubeJobService {
  constructor(
    @Inject(SERVER_DOMAIN_TOKENS.youtube)
    private readonly youtubeService: ServerDomainYouTubeAnalytics,
    @Inject(SERVER_DOMAIN_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerDomainPostAnalytics,
    @Inject(SERVER_DOMAIN_TOKENS.logger)
    private readonly logger: ServerDomainLogger,
  ) {}

  async process(
    job: AnalyticsQueueJob<YouTubeAnalyticsJobData>,
  ): Promise<void> {
    const { posts, organizationId, brandId } = job.data;

    this.logger.log(
      `Processing YouTube analytics batch for ${posts.length} posts`,
    );

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for YouTube analytics batch');
        return;
      }

      const videoIds = posts.map((post) => post.externalId);
      const analyticsMap = await this.youtubeService.getMediaAnalyticsBatch(
        organizationId,
        brandId,
        videoIds,
      );

      await job.updateProgress(50);

      let processed = 0;
      for (const post of posts) {
        const analytics = analyticsMap.get(post.externalId);

        if (analytics) {
          await this.postAnalyticsService.processYouTubeAnalytics(
            post.id,
            analytics,
          );
          processed++;
          continue;
        }

        this.logger.warn(
          `No analytics found for video ${post.externalId} (post ${post.id})`,
        );
      }

      await job.updateProgress(100);

      this.logger.log(
        `YouTube analytics batch completed - processed ${processed}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process YouTube analytics batch for ${posts.length} posts`,
        error,
      );
      throw error;
    }
  }
}
