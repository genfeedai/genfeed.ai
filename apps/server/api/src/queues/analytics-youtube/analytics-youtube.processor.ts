import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface YouTubeAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  organizationId: string;
  brandId: string;
}

@Processor('analytics-youtube')
export class AnalyticsYouTubeProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly youtubeService: YoutubeService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-youtube',
      this.logger,
    );
  }

  async process(job: Job<YouTubeAnalyticsJobData>): Promise<void> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(error.message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<YouTubeAnalyticsJobData>,
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

      // Extract video IDs
      const videoIds = posts.map((post) => post.externalId);

      // Fetch analytics in batch (up to 50 videos per request)
      const analyticsMap = await this.youtubeService.getMediaAnalyticsBatch(
        organizationId,
        brandId,
        videoIds,
      );

      await job.updateProgress(50);

      // Update each post with its analytics
      let processed = 0;
      for (const post of posts) {
        const analytics = analyticsMap.get(post.externalId);

        if (analytics) {
          await this.postAnalyticsService.processYouTubeAnalytics(
            post._id,
            analytics,
          );
          processed++;
        } else {
          this.logger.warn(
            `No analytics found for video ${post.externalId} (post ${post._id})`,
          );
        }
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
