import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailedTarget,
  ServerAnalyticsCollectionState,
} from '@genfeedai/interfaces';
import {
  ANALYTICS_FACEBOOK_QUEUE,
  SocialAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { SERVER_TOKENS, type ServerCredentialStore } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { classifyAnalyticsCollectionError } from '@server/analytics/analytics-collection-state';
import { ANALYTICS_JOB_LIMITER } from '@workers/processors/api/queues/shared/analytics-queue-limiters';
import { Job } from 'bullmq';

@Processor(ANALYTICS_FACEBOOK_QUEUE, { limiter: ANALYTICS_JOB_LIMITER })
export class AnalyticsFacebookProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly facebookService: FacebookService,
    private readonly postAnalyticsService: PostAnalyticsService,
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-facebook',
      this.logger,
    );
  }

  async process(job: Job<SocialAnalyticsJobData>): Promise<void> {
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
    job: Job<SocialAnalyticsJobData>,
  ): Promise<void> {
    const { posts } = job.data;

    this.logger.log(`Processing Facebook analytics for ${posts.length} posts`);

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Facebook analytics batch');
        return;
      }

      const readyTargets: AnalyticsCollectionAttemptRef[] = [];
      const failedTargets: AnalyticsCollectionFailedTarget[] = [];
      let processed = 0;

      for (const post of posts) {
        try {
          const credential = await this.credentialsService.findOne(
            post.credentialId
              ? {
                  id: post.credentialId,
                  isDeleted: false,
                  organizationId: post.organizationId,
                  platform: CredentialPlatform.FACEBOOK,
                }
              : {
                  brandId: post.brandId,
                  isDeleted: false,
                  organizationId: post.organizationId,
                  platform: CredentialPlatform.FACEBOOK,
                },
          );

          if (!credential?.accessToken) {
            throw Object.assign(
              new Error(`No Facebook credential found for post ${post.id}`),
              { status: 401 },
            );
          }

          const decryptedAccessToken = EncryptionUtil.decrypt(
            credential.accessToken,
          );

          const analytics = await this.facebookService.getPostAnalytics(
            post.externalId,
            decryptedAccessToken,
          );

          await this.postAnalyticsService.processFacebookAnalytics(post.id, {
            comments: analytics.comments,
            engagementRate: analytics.engagementRate,
            impressions: analytics.impressions,
            likes: analytics.likes,
            reach: analytics.reach,
            shares: analytics.shares,
            views: analytics.views,
          });
          readyTargets.push({
            attemptKey: job.data.attemptKey,
            brandId: post.brandId,
            id: post.id,
            organizationId: post.organizationId,
            platform: post.platform,
          });
          processed++;
        } catch (error: unknown) {
          const failure = classifyAnalyticsCollectionError(error, 'Facebook');
          this.logger.error(
            `Failed to fetch Facebook analytics for post ${post.id}`,
            error,
          );

          failedTargets.push({
            attemptKey: job.data.attemptKey,
            brandId: post.brandId,
            failure,
            id: post.id,
            organizationId: post.organizationId,
            platform: post.platform,
          });

          if (failure.isRetryable) {
            continue;
          }

          try {
            await this.postsService.patch(post.id, {
              isAnalyticsEnabled: false,
            });
            this.logger.log(
              `Disabled analytics tracking for post ${post.id} after a non-retryable failure`,
            );
          } catch (patchError: unknown) {
            this.logger.error(
              `Failed to disable analytics for post ${post.id}`,
              patchError,
            );
          }
        }
      }

      await this.analyticsCollectionState.markReadyBatch(readyTargets);
      if (failedTargets.length > 0) {
        await this.analyticsCollectionState.markFailedTargets(failedTargets);
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
}
