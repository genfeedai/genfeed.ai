import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface FacebookAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}

@Processor('analytics-facebook')
export class AnalyticsFacebookProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-facebook',
      this.logger,
    );
  }

  async process(job: Job<FacebookAnalyticsJobData>): Promise<void> {
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
    job: Job<FacebookAnalyticsJobData>,
  ): Promise<void> {
    const { posts } = job.data;

    this.logger.log(`Processing Facebook analytics for ${posts.length} posts`);

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Facebook analytics batch');
        return;
      }

      let processed = 0;

      for (const post of posts) {
        try {
          const credential = await this.credentialsService.findOne({
            brand: post.brand,
            isDeleted: false,
            organization: post.organization,
            platform: CredentialPlatform.FACEBOOK,
          });

          if (!credential?.accessToken) {
            this.logger.warn(
              `No Facebook credential found for post ${post._id}`,
            );
            continue;
          }

          const decryptedAccessToken = EncryptionUtil.decrypt(
            credential.accessToken,
          );

          const analytics = await this.facebookService.getPostAnalytics(
            post.externalId,
            decryptedAccessToken,
          );

          await this.postAnalyticsService.processFacebookAnalytics(post._id, {
            comments: analytics.comments,
            engagementRate: analytics.engagementRate,
            impressions: analytics.impressions,
            likes: analytics.likes,
            reach: analytics.reach,
            shares: analytics.shares,
            views: analytics.views,
          });
          processed++;

          // Rate limiting delay
          if (processed < posts.length) {
            await this.delay(this.DEFAULT_DELAY_MS);
          }
        } catch (error: unknown) {
          this.logger.error(
            `Failed to fetch Facebook analytics for post ${post._id}`,
            error,
          );

          // Disable analytics for this post to prevent repeated failures
          try {
            await this.postsService.patch(post._id, {
              isAnalyticsEnabled: false,
            });
            this.logger.log(
              `Disabled analytics tracking for post ${post._id} due to fetch failure`,
            );
          } catch (patchError: unknown) {
            this.logger.error(
              `Failed to disable analytics for post ${post._id}`,
              patchError,
            );
          }
        }
      }

      await job.updateProgress(100);

      this.logger.log(
        `Facebook analytics completed - ${processed}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Facebook analytics batch`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
