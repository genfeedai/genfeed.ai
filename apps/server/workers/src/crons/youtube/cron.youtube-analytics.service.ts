import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueueService } from '@api/queues/core/queue.service';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import {
  ANALYTICS_YOUTUBE_QUEUE,
  YouTubeAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type AnalyticsYoutubePost = PostEntity;

/**
 * YouTube Analytics Cron Service
 * Fetches analytics for YouTube videos every hour using batch API (up to 50 videos per request)
 */
@Injectable()
export class CronYoutubeAnalyticsService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly BATCH_SIZE = 50; // YouTube API max batch size
  private readonly QUEUE_NAME = ANALYTICS_YOUTUBE_QUEUE;

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
  ) {}

  async trackYouTubeAnalytics(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find all published YouTube posts with external IDs
      const posts = (await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            externalId: { not: null },
            isDeleted: false,
            platform: CredentialPlatform.YOUTUBE,
            status: {
              in: [PostStatus.PUBLIC],
            },
          },
        },
        { customLabels, pagination: false },
      )) as unknown as { docs: AnalyticsYoutubePost[] };

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
        const organizationId = resolveRelationId(
          post.organizationId,
          post.organization,
        );
        const brandId = resolveRelationId(post.brandId, post.brand);
        if (!organizationId || !brandId) {
          this.logger.warn(
            `${url} skipping post ${post.id} — missing organizationId/brandId`,
          );
          continue;
        }
        const brandKey = `${organizationId}:${brandId}`;
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

        // Add each batch to the queue. Job payload still uses the historical
        // `organization` / `brand` field names (queue contract), but values
        // come from scalar FKs on the Prisma post row.
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const jobData: YouTubeAnalyticsJobData = {
            brandId,
            organizationId,
            posts: batch.map((post) => ({
              id: post.id.toString(),
              brand: resolveRelationId(post.brandId, post.brand) ?? brandId,
              externalId: post.externalId!,
              organization:
                resolveRelationId(post.organizationId, post.organization) ??
                organizationId,
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
