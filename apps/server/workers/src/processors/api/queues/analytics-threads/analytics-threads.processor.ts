import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailedTarget,
  ServerAnalyticsCollectionState,
} from '@genfeedai/interfaces';
import {
  ANALYTICS_THREADS_QUEUE,
  SocialAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { classifyAnalyticsCollectionError } from '@server/analytics/analytics-collection-state';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { ThreadsService } from '@server/services/integrations/threads/services/threads.service';
import { ANALYTICS_JOB_LIMITER } from '@workers/processors/api/queues/shared/analytics-queue-limiters';
import { Job } from 'bullmq';

@Processor(ANALYTICS_THREADS_QUEUE, { limiter: ANALYTICS_JOB_LIMITER })
export class AnalyticsThreadsProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly threadsService: ThreadsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-threads',
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

    this.logger.log(`Processing Threads analytics for ${posts.length} posts`);

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Threads analytics batch');
        return;
      }

      const readyTargets: AnalyticsCollectionAttemptRef[] = [];
      const failedTargets: AnalyticsCollectionFailedTarget[] = [];
      let processed = 0;

      for (const post of posts) {
        try {
          const analytics = await this.threadsService.getThreadInsights(
            post.organizationId,
            post.brandId,
            post.externalId,
            post.credentialId,
          );

          await this.postAnalyticsService.processThreadsAnalytics(
            post.id,
            analytics,
          );
          readyTargets.push({
            attemptKey: job.data.attemptKey,
            brandId: post.brandId,
            id: post.id,
            organizationId: post.organizationId,
            platform: post.platform,
          });
          processed++;
        } catch (error: unknown) {
          const failure = classifyAnalyticsCollectionError(error, 'Threads');
          this.logger.error(
            `Failed to fetch Threads analytics for post ${post.id}`,
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
        `Threads analytics completed - ${processed}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Threads analytics batch`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
