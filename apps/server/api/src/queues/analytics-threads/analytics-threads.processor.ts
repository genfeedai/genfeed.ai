import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface ThreadsAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}

@Processor('analytics-threads')
export class AnalyticsThreadsProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly threadsService: ThreadsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-threads',
      this.logger,
    );
  }

  async process(job: Job<ThreadsAnalyticsJobData>): Promise<void> {
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
    job: Job<ThreadsAnalyticsJobData>,
  ): Promise<void> {
    const { posts } = job.data;

    this.logger.log(`Processing Threads analytics for ${posts.length} posts`);

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Threads analytics batch');
        return;
      }

      let processed = 0;

      for (const post of posts) {
        try {
          const analytics = await this.threadsService.getThreadInsights(
            post.organization,
            post.brand,
            post.externalId,
          );

          await this.postAnalyticsService.processThreadsAnalytics(
            post._id,
            analytics,
          );
          processed++;

          // Rate limiting delay
          if (processed < posts.length) {
            await this.delay(this.DEFAULT_DELAY_MS);
          }
        } catch (error: unknown) {
          this.logger.error(
            `Failed to fetch Threads analytics for post ${post._id}`,
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
