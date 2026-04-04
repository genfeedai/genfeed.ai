import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type { YouTubeAnalyticsJobData } from '@api/queues/analytics-youtube/analytics-youtube.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * YouTube Analytics Cron Service
 * Fetches analytics for YouTube videos every hour using batch API (up to 50 videos per request)
 */
@Injectable()
export class CronYoutubeAnalyticsService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly BATCH_SIZE = 50; // YouTube API max batch size
  private readonly QUEUE_NAME = 'analytics-youtube';

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async trackYouTubeAnalytics(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find all published YouTube posts with external IDs
      const posts: unknown = await this.postsService.findAll(
        [
          {
            $match: {
              externalId: { $exists: true, $ne: null },
              isDeleted: false,
              platform: CredentialPlatform.YOUTUBE,
              status: {
                $in: [PostStatus.PUBLIC],
              },
            },
          },
          {
            $lookup: {
              as: 'credential',
              foreignField: '_id',
              from: 'credentials',
              localField: 'credential',
            },
          },
          {
            $unwind: '$credential',
          },
        ],
        { customLabels, pagination: false },
      );

      if (!posts.docs || posts.docs.length === 0) {
        this.logger.log(`${url} no YouTube posts to track`);
        return;
      }

      this.logger.log(
        `${url} found ${posts.docs.length} YouTube posts to track`,
      );

      // Group posts by brand (YouTube API requires auth per brand)
      const postsByBrand = new Map<string, typeof posts.docs>();

      for (const post of posts.docs) {
        const brandKey = `${post.organization}:${post.brand}`;
        if (!postsByBrand.has(brandKey)) {
          postsByBrand.set(brandKey, []);
        }
        postsByBrand.get(brandKey)?.push(post);
      }

      this.logger.log(`${url} grouped into ${postsByBrand.size} brands`);

      // Process each brand's posts in batches
      let totalBatches = 0;
      for (const [brandKey, brandPosts] of postsByBrand.entries()) {
        const [organizationId, brandId] = brandKey.split(':');

        // Create batches of 50 (YouTube API limit)
        const batches: (typeof brandPosts)[] = [];
        for (let i = 0; i < brandPosts.length; i += this.BATCH_SIZE) {
          batches.push(brandPosts.slice(i, i + this.BATCH_SIZE));
        }

        // Add each batch to the queue
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const jobData: YouTubeAnalyticsJobData = {
            brandId,
            organizationId,
            posts: batch.map((post: PostEntity) => ({
              _id: post._id.toString(),
              brand: post.brand.toString(),
              externalId: post.externalId!,
              organization: post.organization.toString(),
            })),
          };

          await this.queueService.add(this.QUEUE_NAME, jobData, {
            attempts: 3,
            backoff: {
              delay: 2000,
              type: 'exponential',
            },
          });

          totalBatches++;
          this.logger.log(
            `${url} queued batch ${totalBatches} for brand ${brandId} with ${batch.length} posts`,
          );
        }
      }

      this.logger.log(`${url} completed - queued ${totalBatches} batches`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
