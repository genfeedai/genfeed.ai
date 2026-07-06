import { CredentialPlatform } from '@genfeedai/enums';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerPosts,
  type ServerSocialAnalytics,
} from '@server/server.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';

@Injectable()
export class AnalyticsSocialJobService {
  private readonly DEFAULT_DELAY_MS = 2000;

  constructor(
    @Inject(SERVER_TOKENS.instagram)
    private readonly instagramService: ServerSocialAnalytics,
    @Inject(SERVER_TOKENS.linkedIn)
    private readonly linkedInService: ServerSocialAnalytics,
    @Inject(SERVER_TOKENS.mastodon)
    private readonly mastodonService: ServerSocialAnalytics,
    @Inject(SERVER_TOKENS.tiktok)
    private readonly tiktokService: ServerSocialAnalytics,
    @Inject(SERVER_TOKENS.pinterest)
    private readonly pinterestService: ServerSocialAnalytics,
    @Inject(SERVER_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerPostAnalytics,
    @Inject(SERVER_TOKENS.posts)
    private readonly postsService: ServerPosts,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async process(job: AnalyticsQueueJob<SocialAnalyticsJobData>): Promise<void> {
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

      const postsByPlatform = new Map<CredentialPlatform, typeof posts>();

      for (const post of posts) {
        if (!postsByPlatform.has(post.platform)) {
          postsByPlatform.set(post.platform, []);
        }
        postsByPlatform.get(post.platform)?.push(post);
      }

      const platformProcessors: Promise<void>[] = [];

      const instagramPosts = postsByPlatform.get(CredentialPlatform.INSTAGRAM);
      if (instagramPosts) {
        platformProcessors.push(this.processInstagramPosts(instagramPosts));
      }

      const tiktokPosts = postsByPlatform.get(CredentialPlatform.TIKTOK);
      if (tiktokPosts) {
        platformProcessors.push(this.processTikTokPosts(tiktokPosts));
      }

      const pinterestPosts = postsByPlatform.get(CredentialPlatform.PINTEREST);
      if (pinterestPosts) {
        platformProcessors.push(this.processPinterestPosts(pinterestPosts));
      }

      const linkedInPosts = postsByPlatform.get(CredentialPlatform.LINKEDIN);
      if (linkedInPosts) {
        platformProcessors.push(this.processLinkedInPosts(linkedInPosts));
      }

      const mastodonPosts = postsByPlatform.get(CredentialPlatform.MASTODON);
      if (mastodonPosts) {
        platformProcessors.push(this.processMastodonPosts(mastodonPosts));
      }

      const results = await Promise.allSettled(platformProcessors);

      await job.updateProgress(100);

      const successCount = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      const failCount = results.filter(
        (result) => result.status === 'rejected',
      ).length;

      this.logger.log(
        `Social media analytics completed - ${successCount} platforms succeeded, ${failCount} failed`,
      );

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
        'Failed to process social media analytics batch',
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
          ? mediaTypeMap[analytics.mediaType as keyof typeof mediaTypeMap]
          : undefined;

        await this.postAnalyticsService.processInstagramAnalytics(post.id, {
          ...analytics,
          mediaType: transformedMediaType,
        });
        processed++;

        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        await this.disableAnalyticsAfterFailure(post.id, 'Instagram', error);
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

        await this.postAnalyticsService.processTikTokAnalytics(post.id, {
          ...analytics,
          shares: analytics.shares ?? 0,
        });
        processed++;

        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        await this.disableAnalyticsAfterFailure(post.id, 'TikTok', error);
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
          post.id,
          analytics,
        );
        processed++;

        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        await this.disableAnalyticsAfterFailure(post.id, 'Pinterest', error);
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

        await this.postAnalyticsService.processLinkedInAnalytics(post.id, {
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

        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        await this.disableAnalyticsAfterFailure(post.id, 'LinkedIn', error);
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
          post.id,
          analytics,
        );
        processed++;

        if (processed < posts.length) {
          await this.delay(this.DEFAULT_DELAY_MS);
        }
      } catch (error: unknown) {
        await this.disableAnalyticsAfterFailure(post.id, 'Mastodon', error);
      }
    }

    this.logger.log(
      `Mastodon analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async disableAnalyticsAfterFailure(
    postId: string,
    platform: string,
    error: unknown,
  ): Promise<void> {
    this.logger.error(
      `Failed to fetch ${platform} analytics for post ${postId}`,
      error,
    );

    try {
      await this.postsService.patch(postId, {
        isAnalyticsEnabled: false,
      });

      this.logger.log(
        `Disabled analytics tracking for post ${postId} due to fetch failure`,
      );
    } catch (patchError: unknown) {
      this.logger.error(
        `Failed to disable analytics for post ${postId}`,
        patchError,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
