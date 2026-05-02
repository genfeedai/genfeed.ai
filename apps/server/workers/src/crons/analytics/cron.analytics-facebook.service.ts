import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type { FacebookAnalyticsJobData } from '@api/queues/analytics-facebook/analytics-facebook.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Facebook Analytics Cron Service
 * Fetches analytics for Facebook posts every hour
 * Facebook Graph API does not support batch analytics — posts are processed individually
 */
@Injectable()
export class CronAnalyticsFacebookService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'analytics-facebook';
  private readonly CHUNK_SIZE = 50;

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async trackFacebookAnalytics(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const result = await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            externalId: { not: null },
            isAnalyticsEnabled: { not: false },
            isDeleted: false,
            platform: {
              in: [CredentialPlatform.FACEBOOK],
            },
            status: PostStatus.PUBLIC,
          },
        },
        { customLabels, pagination: false },
      );
      const posts = result as unknown as { docs: PostEntity[] };

      if (!posts.docs || posts.docs.length === 0) {
        this.logger.log(`${url} no Facebook posts to track`);
        return;
      }

      this.logger.log(
        `${url} found ${posts.docs.length} Facebook posts to track`,
      );

      // Group posts into chunks for parallel processing
      const chunks: PostEntity[][] = [];
      for (let i = 0; i < posts.docs.length; i += this.CHUNK_SIZE) {
        chunks.push(posts.docs.slice(i, i + this.CHUNK_SIZE));
      }

      this.logger.log(
        `${url} created ${chunks.length} chunks (${this.CHUNK_SIZE} posts/chunk)`,
      );

      // Add each chunk to the queue
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const jobData: FacebookAnalyticsJobData = {
          posts: chunk.map((post: PostEntity) => ({
            _id: post._id.toString(),
            brand: post.brand.toString(),
            externalId: post.externalId!,
            organization: post.organization.toString(),
            platform: post.platform as CredentialPlatform,
          })),
        };

        await this.queueService.add(this.QUEUE_NAME, jobData, {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
        });

        this.logger.log(
          `${url} queued chunk ${i + 1}/${chunks.length} with ${chunk.length} posts`,
        );
      }

      this.logger.log(`${url} completed - queued ${chunks.length} chunks`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
