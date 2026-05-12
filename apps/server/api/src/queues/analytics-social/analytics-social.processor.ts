import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface SocialAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}

@Processor('analytics-social')
export class AnalyticsSocialProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly instagramService: InstagramService,
    private readonly linkedInService: LinkedInService,
    private readonly mastodonService: MastodonService,
    private readonly tiktokService: TiktokService,
    private readonly pinterestService: PinterestService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-social',
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

    this.logger.log(
      `Processing social media analytics for ${posts.length} posts`,
    );

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for social analytics batch');
        return;
      }

      // Group posts by platform for parallel processing
      const postsByPlatform = new Map<CredentialPlatform, typeof posts>();

      for (const post of posts) {
        if (!postsByPlatform.has(post.platform)) {
          postsByPlatform.set(post.platform, []);
        }
        postsByPlatform.get(post.platform)?.push(post);
      }

      // Process each platform in parallel
      const platformProcessors = [];

      if (postsByPlatform.has(CredentialPlatform.INSTAGRAM)) {
        platformProcessors.push(
          this.processInstagramPosts(
            postsByPlatform.get(CredentialPlatform.INSTAGRAM)!,
          ),
        );
      }

      if (postsByPlatform.has(CredentialPlatform.TIKTOK)) {
        platformProcessors.push(
          this.processTikTokPosts(
            postsByPlatform.get(CredentialPlatform.TIKTOK)!,
          ),
        );
      }

      if (postsByPlatform.has(CredentialPlatform.PINTEREST)) {
        platformProcessors.push(
          this.processPinterestPosts(
            postsByPlatform.get(CredentialPlatform.PINTEREST)!,
          ),
        );
      }

      if (postsByPlatform.has(CredentialPlatform.LINKEDIN)) {
        platformProcessors.push(
          this.processLinkedInPosts(
            postsByPlatform.get(CredentialPlatform.LINKEDIN)!,
          ),
        );
      }

      if (postsByPlatform.has(CredentialPlatform.MASTODON)) {
        platformProcessors.push(
          this.processMastodonPosts(
            postsByPlatform.get(CredentialPlatform.MASTODON)!,
          ),
        );
      }

      // Wait for all platforms to complete
      const results = await Promise.allSettled(platformProcessors);

      await job.updateProgress(100);

      const successCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const failCount = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(
        `Social media analytics completed - ${successCount} platforms succeeded, ${failCount} failed`,
      );

      // If any platform failed, log the errors
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `Platform ${index} analytics failed`,
            result.reason,
          );
        }
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process social media analytics batch`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  private async processInstagramPosts(
    posts: SocialAnalyticsJobData['posts'],
  ): Promise<void> {
    this.logger.log(`Processing ${posts.length} Instagram posts`);
    let processed = 0;

    for (const post of posts) {
      try {
        const analytics = await this.instagramService.getMediaAnalytics(
          post.organization,
          post.brand,
          post.externalId,
        );

        // Convert mediaType from uppercase to lowercase format
        const mediaTypeMap: Record<
          'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS',
          'image' | 'video' | 'carousel' | 'reel'
        > = {
          CAROUSEL_ALBUM: 'carousel',
          IMAGE: 'image',
          REELS: 'reel',
          VIDEO: 'video',
        };

        const transformedMediaType = analytics.mediaType
          ? // @ts-expect-error TS7053
            (mediaTypeMap[analytics.mediaType] as
              | 'image'
              | 'video'
              | 'carousel'
              | 'reel'
              | undefined)
          : undefined;

        await this.postAnalyticsService.processInstagramAnalytics(post._id, {
          ...analytics,
          mediaType: transformedMediaType,
        });
        processed++;

        // Rate limiting delay
        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        this.logger.error(
          `Failed to fetch Instagram analytics for post ${post._id}`,
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

    this.logger.log(
      `Instagram analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processTikTokPosts(
    posts: SocialAnalyticsJobData['posts'],
  ): Promise<void> {
    this.logger.log(`Processing ${posts.length} TikTok posts`);
    let processed = 0;

    for (const post of posts) {
      try {
        const analytics = await this.tiktokService.getMediaAnalytics(
          post.organization,
          post.brand,
          post.externalId,
        );

        await this.postAnalyticsService.processTikTokAnalytics(post._id, {
          ...analytics,
          shares: analytics.shares ?? 0,
        });
        processed++;

        // Rate limiting delay
        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        this.logger.error(
          `Failed to fetch TikTok analytics for post ${post._id}`,
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

    this.logger.log(
      `TikTok analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processPinterestPosts(
    posts: SocialAnalyticsJobData['posts'],
  ): Promise<void> {
    this.logger.log(`Processing ${posts.length} Pinterest posts`);
    let processed = 0;

    for (const post of posts) {
      try {
        const analytics = await this.pinterestService.getMediaAnalytics(
          post.organization,
          post.brand,
          post.externalId,
        );

        await this.postAnalyticsService.processPinterestAnalytics(
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
          `Failed to fetch Pinterest analytics for post ${post._id}`,
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

    this.logger.log(
      `Pinterest analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processLinkedInPosts(
    posts: SocialAnalyticsJobData['posts'],
  ): Promise<void> {
    this.logger.log(`Processing ${posts.length} LinkedIn posts`);
    let processed = 0;

    for (const post of posts) {
      try {
        const analytics = await this.linkedInService.getMediaAnalytics(
          post.organization,
          post.brand,
          post.externalId,
        );

        // LinkedIn returns reactions as an object — map fields explicitly (no spread)
        await this.postAnalyticsService.processLinkedInAnalytics(post._id, {
          clicks: analytics.clicks,
          comments: analytics.comments,
          engagementRate: analytics.engagementRate,
          impressions: analytics.impressions,
          likes: analytics.likes,
          mediaType: analytics.mediaType,
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
          `Failed to fetch LinkedIn analytics for post ${post._id}`,
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

    this.logger.log(
      `LinkedIn analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processMastodonPosts(
    posts: SocialAnalyticsJobData['posts'],
  ): Promise<void> {
    this.logger.log(`Processing ${posts.length} Mastodon posts`);
    let processed = 0;

    for (const post of posts) {
      try {
        const analytics = await this.mastodonService.getMediaAnalytics(
          post.organization,
          post.brand,
          post.externalId,
        );

        await this.postAnalyticsService.processMastodonAnalytics(
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
          `Failed to fetch Mastodon analytics for post ${post._id}`,
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

    this.logger.log(
      `Mastodon analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
