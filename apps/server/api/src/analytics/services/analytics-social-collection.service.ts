import type {
  AnalyticsCollectionPost,
  SocialAnalyticsCollectionInput,
} from '@api/analytics/analytics-collection-action.types';
import {
  attributionFailureFor,
  isAnalyticsAttributionFailure,
  resolveAnalyticsCollectionCredential,
} from '@api/analytics/analytics-collection-credential';
import { classifyAnalyticsCollectionError } from '@api/analytics/analytics-collection-state';
import {
  AccountAnalyticsSnapshotService,
  extractProfileCounts,
} from '@api/endpoints/analytics/account-analytics-snapshot.service';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerPosts,
  type ServerSocialAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  AnalyticsPersistenceContext,
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsSocialCollectionService {
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
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
    private readonly accountSnapshots: AccountAnalyticsSnapshotService,
  ) {}

  async collect(
    data: SocialAnalyticsCollectionInput,
  ): Promise<AnalyticsPersistenceContext> {
    if (data.posts.length !== 1) {
      throw new Error('Social analytics action requires exactly one post');
    }
    const post = data.posts[0];
    if (!post) {
      throw new Error('Social analytics action requires exactly one post');
    }
    try {
      const context = await this.collectPost(post);
      await this.analyticsCollectionState.markReady(
        this.target(data.attemptKey, post),
      );
      return context;
    } catch (error: unknown) {
      const platform = this.platformLabel(post.platform);
      const failure = classifyAnalyticsCollectionError(error, platform);
      this.logger.error(
        `Failed to collect ${platform} analytics for post ${post.id}`,
        error,
      );
      await this.analyticsCollectionState.markFailed(
        this.target(data.attemptKey, post),
        failure,
      );
      if (
        !failure.isRetryable &&
        !isAnalyticsAttributionFailure(failure.code)
      ) {
        await this.postsService.patch(post.id, { isAnalyticsEnabled: false });
      }
      throw error;
    }
  }

  private async collectPost(
    post: AnalyticsCollectionPost,
  ): Promise<AnalyticsPersistenceContext> {
    const resolution = await this.resolveCollectionCredential(post);
    const credentialId = resolution.credentialId;
    const context = {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };

    switch (post.platform) {
      case CredentialPlatform.INSTAGRAM: {
        const analytics = await this.instagramService.getMediaAnalytics(
          post.organizationId,
          post.brandId,
          post.externalId,
          credentialId,
        );
        const mediaTypes = {
          CAROUSEL_ALBUM: 'carousel',
          IMAGE: 'image',
          REELS: 'reel',
          VIDEO: 'video',
        } as const;
        await this.postAnalyticsService.processInstagramAnalytics(
          post.id,
          {
            ...analytics,
            mediaType: analytics.mediaType
              ? mediaTypes[analytics.mediaType as keyof typeof mediaTypes]
              : undefined,
          },
          {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
        );
        await this.recordSnapshot(post, credentialId, analytics);
        return context;
      }
      case CredentialPlatform.TIKTOK: {
        const analytics = await this.tiktokService.getMediaAnalytics(
          post.organizationId,
          post.brandId,
          post.externalId,
          credentialId,
        );
        await this.postAnalyticsService.processTikTokAnalytics(
          post.id,
          {
            ...analytics,
            shares: analytics.shares ?? 0,
          },
          {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
        );
        await this.recordSnapshot(post, credentialId, analytics);
        return context;
      }
      case CredentialPlatform.PINTEREST: {
        const analytics = await this.pinterestService.getMediaAnalytics(
          post.organizationId,
          post.brandId,
          post.externalId,
          credentialId,
        );
        await this.postAnalyticsService.processPinterestAnalytics(
          post.id,
          analytics,
          {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
        );
        await this.recordSnapshot(post, credentialId, analytics);
        return context;
      }
      case CredentialPlatform.LINKEDIN: {
        const analytics = await this.linkedInService.getMediaAnalytics(
          post.organizationId,
          post.brandId,
          post.externalId,
          credentialId,
        );
        await this.postAnalyticsService.processLinkedInAnalytics(
          post.id,
          {
            clicks: analytics.clicks,
            comments: analytics.comments,
            engagementRate: analytics.engagementRate,
            impressions: analytics.impressions,
            likes: analytics.likes,
            mediaType: analytics.mediaType,
            reach: analytics.reach,
            shares: analytics.shares,
            views: analytics.views,
          },
          {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
        );
        await this.recordSnapshot(post, credentialId, analytics);
        return context;
      }
      case CredentialPlatform.MASTODON: {
        const analytics = await this.mastodonService.getMediaAnalytics(
          post.organizationId,
          post.brandId,
          post.externalId,
          credentialId,
        );
        await this.postAnalyticsService.processMastodonAnalytics(
          post.id,
          analytics,
          {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
        );
        await this.recordSnapshot(post, credentialId, analytics);
        return context;
      }
      default:
        throw new Error(
          `Unsupported social analytics platform: ${post.platform}`,
        );
    }
  }

  private async resolveCollectionCredential(post: AnalyticsCollectionPost) {
    const resolution = await resolveAnalyticsCollectionCredential({
      brandId: post.brandId,
      credentialId: post.credentialId,
      lookup: this.credentialsService,
      organizationId: post.organizationId,
      platform: post.platform,
    });
    if (
      resolution.kind === 'ambiguous' ||
      resolution.kind === 'missing' ||
      resolution.kind === 'mismatch'
    ) {
      throw Object.assign(
        new Error(attributionFailureFor(resolution.kind).message),
        {
          analyticsFailure: attributionFailureFor(resolution.kind),
          status: 409,
        },
      );
    }
    return resolution;
  }

  private async recordSnapshot(
    post: AnalyticsCollectionPost,
    credentialId: string,
    analytics: unknown,
  ): Promise<void> {
    const counts = extractProfileCounts(analytics);
    await this.accountSnapshots.upsertDailySnapshot({
      brandId: post.brandId,
      credentialId,
      organizationId: post.organizationId,
      platform: post.platform,
      ...counts,
    });
  }

  private platformLabel(platform: CredentialPlatform): string {
    return platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  private target(
    attemptKey: string | undefined,
    post: AnalyticsCollectionPost,
  ) {
    return {
      attemptKey,
      brandId: post.brandId,
      id: post.id,
      organizationId: post.organizationId,
      platform: post.platform,
    };
  }
}
