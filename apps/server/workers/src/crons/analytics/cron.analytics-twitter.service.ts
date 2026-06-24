import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type { TwitterAnalyticsJobData } from '@api/queues/analytics-twitter/analytics-twitter-job.interface';
import { QueueService } from '@api/queues/core/queue.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type AnalyticsTwitterPost = {
  _id: unknown;
  brand: unknown;
  credential: { _id: unknown };
  externalId: string;
  organization: unknown;
};

/**
 * Twitter Analytics Cron Service
 * Fetches analytics for Twitter posts every 30 minutes using batch API (up to 100 tweets per request)
 */
@Injectable()
export class CronAnalyticsTwitterService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly BATCH_SIZE = 100; // Twitter API max batch size
  private readonly QUEUE_NAME = 'analytics-twitter';

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
  ) {}

  async trackTwitterAnalytics(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find all published Twitter posts with external IDs
      const posts = (await this.postsService.findAll(
        {
          include: { credential: true },
          orderBy: { publishedAt: 'desc' },
          where: {
            externalId: { not: null },
            isDeleted: false,
            platform: CredentialPlatform.TWITTER,
            status: PostStatus.PUBLIC,
          },
        },
        { customLabels, pagination: false },
      )) as unknown as { docs: AnalyticsTwitterPost[] };

      if (!posts.docs || posts.docs.length === 0) {
        this.logger.log(`${url} no Twitter posts to track`);
        return;
      }

      this.logger.log(
        `${url} found ${posts.docs.length} Twitter posts to track`,
      );

      // Group posts by credential (each Twitter account needs its own auth)
      const postsByCredential = new Map<string, typeof posts.docs>();

      for (const post of posts.docs) {
        const credentialId = String(post.credential._id);
        if (!postsByCredential.has(credentialId)) {
          postsByCredential.set(credentialId, []);
        }
        postsByCredential.get(credentialId)?.push(post);
      }

      this.logger.log(
        `${url} grouped into ${postsByCredential.size} credentials`,
      );

      // Process each credential's posts in batches
      let totalBatches = 0;
      for (const [
        credentialId,
        credentialPosts,
      ] of postsByCredential.entries()) {
        // Create batches of 100 (Twitter API limit)
        const batches: (typeof credentialPosts)[] = [];
        for (let i = 0; i < credentialPosts.length; i += this.BATCH_SIZE) {
          batches.push(credentialPosts.slice(i, i + this.BATCH_SIZE));
        }

        // Add each batch to the queue
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const jobData: TwitterAnalyticsJobData = {
            credentialId: credentialId,
            posts: batch.map((post) => ({
              _id: String(post._id),
              brand: String(post.brand),
              externalId: post.externalId,
              organization: String(post.organization),
            })),
          };

          await this.queueService.add(this.QUEUE_NAME, jobData, {
            attempts: 3,
            backoff: {
              delay: 5000, // Start with 5 seconds delay for rate limit backoff
              type: 'exponential',
            },
          });

          totalBatches++;
          this.logger.log(
            `${url} queued batch ${totalBatches} for credential ${credentialId} with ${batch.length} posts`,
          );
        }
      }

      this.logger.log(`${url} completed - queued ${totalBatches} batches`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
