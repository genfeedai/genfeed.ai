import { CredentialPlatform } from '@genfeedai/enums';
import type { ServerAnalyticsCollectionState } from '@genfeedai/interfaces';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerPosts,
  type ServerSocialAnalytics,
} from '@server/server.dependencies';
import { classifyAnalyticsCollectionError } from '../analytics-collection-state';
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
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
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
        platformProcessors.push(
          this.processInstagramPosts(instagramPosts, job.data.attemptKey),
        );
      }

      const tiktokPosts = postsByPlatform.get(CredentialPlatform.TIKTOK);
      if (tiktokPosts) {
        platformProcessors.push(
          this.processTikTokPosts(tiktokPosts, job.data.attemptKey),
        );
      }

      const pinterestPosts = postsByPlatform.get(CredentialPlatform.PINTEREST);
      if (pinterestPosts) {
        platformProcessors.push(
          this.processPinterestPosts(pinterestPosts, job.data.attemptKey),
        );
      }

      const linkedInPosts = postsByPlatform.get(CredentialPlatform.LINKEDIN);
      if (linkedInPosts) {
        platformProcessors.push(
          this.processLinkedInPosts(linkedInPosts, job.data.attemptKey),
        );
      }

      const mastodonPosts = postsByPlatform.get(CredentialPlatform.MASTODON);
      if (mastodonPosts) {
        platformProcessors.push(
          this.processMastodonPosts(mastodonPosts, job.data.attemptKey),
        );
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
    attemptKey?: string,
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
      } catch (error: unknown) {
        await this.recordAnalyticsFailure(post, 'Instagram', error, attemptKey);
        continue;
      }

      await this.recordAnalyticsReady(post, attemptKey);
      if (processed < posts.length) {
        await this.delay(this.DEFAULT_DELAY_MS);
      }
    }

    this.logger.log(
      `Instagram analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processTikTokPosts(
    posts: SocialAnalyticsJobData['posts'],
    attemptKey?: string,
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
      } catch (error: unknown) {
        await this.recordAnalyticsFailure(post, 'TikTok', error, attemptKey);
        continue;
      }

      await this.recordAnalyticsReady(post, attemptKey);
      if (processed < posts.length) {
        await this.delay(this.DEFAULT_DELAY_MS);
      }
    }

    this.logger.log(
      `TikTok analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processPinterestPosts(
    posts: SocialAnalyticsJobData['posts'],
    attemptKey?: string,
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
      } catch (error: unknown) {
        await this.recordAnalyticsFailure(post, 'Pinterest', error, attemptKey);
        continue;
      }

      await this.recordAnalyticsReady(post, attemptKey);
      if (processed < posts.length) {
        await this.delay(this.DEFAULT_DELAY_MS);
      }
    }

    this.logger.log(
      `Pinterest analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processLinkedInPosts(
    posts: SocialAnalyticsJobData['posts'],
    attemptKey?: string,
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
      } catch (error: unknown) {
        await this.recordAnalyticsFailure(post, 'LinkedIn', error, attemptKey);
        continue;
      }

      await this.recordAnalyticsReady(post, attemptKey);
      if (processed < posts.length) {
        await this.delay(this.DEFAULT_DELAY_MS);
      }
    }

    this.logger.log(
      `LinkedIn analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async processMastodonPosts(
    posts: SocialAnalyticsJobData['posts'],
    attemptKey?: string,
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
      } catch (error: unknown) {
        await this.recordAnalyticsFailure(post, 'Mastodon', error, attemptKey);
        continue;
      }

      await this.recordAnalyticsReady(post, attemptKey);
      if (processed < posts.length) {
        await this.delay(this.DEFAULT_DELAY_MS);
      }
    }

    this.logger.log(
      `Mastodon analytics completed - ${processed}/${posts.length} posts`,
    );
  }

  private async recordAnalyticsFailure(
    post: SocialAnalyticsJobData['posts'][number],
    platform: string,
    error: unknown,
    attemptKey?: string,
  ): Promise<void> {
    const failure = classifyAnalyticsCollectionError(error, platform);
    this.logger.error(
      `Failed to fetch ${platform} analytics for post ${post.id}`,
      error,
    );

    await this.analyticsCollectionState.markFailed(
      {
        attemptKey,
        brandId: post.brand,
        id: post.id,
        organizationId: post.organization,
        platform: post.platform,
      },
      failure,
    );

    if (failure.isRetryable) {
      return;
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

  private async recordAnalyticsReady(
    post: SocialAnalyticsJobData['posts'][number],
    attemptKey?: string,
  ): Promise<void> {
    try {
      await this.analyticsCollectionState.markReady({
        attemptKey,
        brandId: post.brand,
        id: post.id,
        organizationId: post.organization,
        platform: post.platform,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to mark analytics collection ready for post ${post.id}`,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
