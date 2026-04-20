import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface TwitterAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  credentialId: string;
}

@Processor('analytics-twitter')
export class AnalyticsTwitterProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly twitterService: TwitterService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly credentialsService: CredentialsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-twitter',
      this.logger,
    );
  }

  async process(job: Job<TwitterAnalyticsJobData>): Promise<void> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<TwitterAnalyticsJobData>,
  ): Promise<void> {
    const { posts, credentialId } = job.data;

    this.logger.log(
      `Processing Twitter analytics batch for ${posts.length} posts`,
    );

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Twitter analytics batch');
        return;
      }

      // Fetch credential through the service layer so decryption accessors run.
      const credential: unknown = await this.credentialsService.findOne({
        _id: credentialId,
      });

      if (!credential) {
        this.logger.error(`Credential ${credentialId} not found`);
        throw new Error(`Credential ${credentialId} not found`);
      }

      // Extract tweet IDs
      const tweetIds = posts.map((post) => post.externalId);

      // Fetch analytics in batch (up to 100 tweets per request)
      const analyticsMap = await this.twitterService.getMediaAnalyticsBatch(
        tweetIds,
        credential.accessToken,
        credential.accessTokenSecret,
      );

      await job.updateProgress(50);

      // Update each post with its analytics
      let processed = 0;
      for (const post of posts) {
        const analytics = analyticsMap.get(post.externalId);

        if (analytics) {
          await this.postAnalyticsService.processTwitterAnalytics(
            post._id,
            analytics,
          );

          processed++;
        } else {
          this.logger.warn(
            `No analytics found for tweet ${post.externalId} (post ${post._id})`,
          );
        }
      }

      await job.updateProgress(100);

      this.logger.log(
        `Twitter analytics batch completed - processed ${processed}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      // Don't log rate limit errors - already handled by TwitterService
      // BullMQ will automatically retry with exponential backoff
      if (!(error as unknown).rateLimitReset) {
        this.logger.error(
          `Failed to process Twitter analytics batch for ${posts.length} posts`,
          error,
        );
      }

      throw error;
    }
  }
}
