import { randomUUID } from 'node:crypto';
import type {
  AnalyticsCollectionAuthorization,
  AnalyticsCollectionPost,
  SocialAnalyticsCollectionInput,
} from '@api/analytics/analytics-collection-action.types';
import {
  admitAnalyticsCollection,
  isAnalyticsCollectionAuthorizationFailure,
} from '@api/analytics/analytics-collection-authorization';
import {
  attributionFailureFor,
  isAnalyticsAttributionFailure,
  resolveAnalyticsCollectionCredential,
} from '@api/analytics/analytics-collection-credential';
import { classifyAnalyticsCollectionError } from '@api/analytics/analytics-collection-state';
import {
  exposureCollectionContext,
  prepareExposureCollectionSource,
} from '@api/analytics/services/analytics-exposure-source.util';
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
  BreakoutPublicationSourceV1,
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
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
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(
      authorization,
      data.posts[0]?.organizationId,
    );
    if (data.posts.length !== 1) {
      throw new Error('Social analytics action requires exactly one post');
    }
    const post = data.posts[0];
    if (!post) {
      throw new Error('Social analytics action requires exactly one post');
    }
    try {
      const context = await this.collectPost(post, authorization);
      await admitAnalyticsCollection(authorization);
      await this.analyticsCollectionState.markReady(
        this.target(data.attemptKey, post),
      );
      await admitAnalyticsCollection(authorization);
      return context;
    } catch (error: unknown) {
      if (isAnalyticsCollectionAuthorizationFailure(error)) throw error;
      await admitAnalyticsCollection(authorization);
      const platform = this.platformLabel(post.platform);
      const failure = classifyAnalyticsCollectionError(error, platform);
      this.logger.error(
        `Failed to collect ${platform} analytics for post ${post.id}`,
        error,
      );
      await admitAnalyticsCollection(authorization);
      await this.analyticsCollectionState.markFailed(
        this.target(data.attemptKey, post),
        failure,
      );
      if (
        !failure.isRetryable &&
        !isAnalyticsAttributionFailure(failure.code)
      ) {
        await admitAnalyticsCollection(authorization);
        await this.postsService.patch(post.id, { isAnalyticsEnabled: false });
      }
      throw error;
    }
  }

  private async collectPost(
    post: AnalyticsCollectionPost,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const resolution = await this.resolveCollectionCredential(
      post,
      authorization,
    );
    const credentialId = resolution.credentialId;
    await admitAnalyticsCollection(authorization);
    const publicationSource =
      await this.postAnalyticsService.prepareLearningObservation({
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId,
        postId: post.id,
        platform: post.platform,
        externalId: post.externalId,
      });
    await admitAnalyticsCollection(authorization);
    const exposureSource = await prepareExposureCollectionSource(
      this.postAnalyticsService,
      {
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId,
        postId: post.id,
        platform: post.platform,
        externalId: post.externalId,
      },
    );
    const sourceAttemptId = randomUUID(),
      requestStartedAt = new Date();

    switch (post.platform) {
      case CredentialPlatform.INSTAGRAM:
        return this.collectInstagram(
          post,
          credentialId,
          publicationSource,
          sourceAttemptId,
          requestStartedAt,
          exposureSource,
          authorization,
        );
      case CredentialPlatform.TIKTOK:
        return this.collectTikTok(
          post,
          credentialId,
          publicationSource,
          sourceAttemptId,
          requestStartedAt,
          exposureSource,
          authorization,
        );
      case CredentialPlatform.PINTEREST:
        return this.collectPinterest(
          post,
          credentialId,
          publicationSource,
          sourceAttemptId,
          requestStartedAt,
          exposureSource,
          authorization,
        );
      case CredentialPlatform.LINKEDIN:
        return this.collectLinkedIn(
          post,
          credentialId,
          publicationSource,
          sourceAttemptId,
          requestStartedAt,
          exposureSource,
          authorization,
        );
      case CredentialPlatform.MASTODON:
        return this.collectMastodon(
          post,
          credentialId,
          publicationSource,
          sourceAttemptId,
          requestStartedAt,
          exposureSource,
          authorization,
        );
      default:
        throw new Error(
          `Unsupported social analytics platform: ${post.platform}`,
        );
    }
  }
  private async collectInstagram(
    post: AnalyticsCollectionPost,
    credentialId: string,
    publicationSource: LearningPublicationSourceV1 | null,
    sourceAttemptId: string,
    requestStartedAt: Date,
    exposureSource: BreakoutPublicationSourceV1 | null,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const analytics = await this.instagramService.getMediaAnalytics(
      post.organizationId,
      post.brandId,
      post.externalId,
      credentialId,
    );
    const receivedAt = new Date();
    await admitAnalyticsCollection(authorization);
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
        ...exposureCollectionContext(exposureSource, {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
        }),
        learningObservation: {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
          ...(publicationSource ? { publicationSource } : {}),
        },
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId: credentialId,
      },
      authorization,
    );
    await this.recordSnapshot(post, credentialId, analytics, authorization);
    return {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };
  }
  private async collectTikTok(
    post: AnalyticsCollectionPost,
    credentialId: string,
    publicationSource: LearningPublicationSourceV1 | null,
    sourceAttemptId: string,
    requestStartedAt: Date,
    exposureSource: BreakoutPublicationSourceV1 | null,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const analytics = await this.tiktokService.getMediaAnalytics(
      post.organizationId,
      post.brandId,
      post.externalId,
      credentialId,
    );
    const receivedAt = new Date();
    await admitAnalyticsCollection(authorization);
    await this.postAnalyticsService.processTikTokAnalytics(
      post.id,
      {
        ...analytics,
        shares: analytics.shares ?? 0,
      },
      {
        ...exposureCollectionContext(exposureSource, {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
        }),
        learningObservation: {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
          ...(publicationSource ? { publicationSource } : {}),
        },
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId: credentialId,
      },
      authorization,
    );
    await this.recordSnapshot(post, credentialId, analytics, authorization);
    return {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };
  }
  private async collectPinterest(
    post: AnalyticsCollectionPost,
    credentialId: string,
    publicationSource: LearningPublicationSourceV1 | null,
    sourceAttemptId: string,
    requestStartedAt: Date,
    exposureSource: BreakoutPublicationSourceV1 | null,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const analytics = await this.pinterestService.getMediaAnalytics(
      post.organizationId,
      post.brandId,
      post.externalId,
      credentialId,
    );
    const receivedAt = new Date();
    await admitAnalyticsCollection(authorization);
    await this.postAnalyticsService.processPinterestAnalytics(
      post.id,
      analytics,
      {
        ...exposureCollectionContext(exposureSource, {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
        }),
        learningObservation: {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
          ...(publicationSource ? { publicationSource } : {}),
        },
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId: credentialId,
      },
      authorization,
    );
    await this.recordSnapshot(post, credentialId, analytics, authorization);
    return {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };
  }
  private async collectLinkedIn(
    post: AnalyticsCollectionPost,
    credentialId: string,
    publicationSource: LearningPublicationSourceV1 | null,
    sourceAttemptId: string,
    requestStartedAt: Date,
    exposureSource: BreakoutPublicationSourceV1 | null,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const analytics = await this.linkedInService.getMediaAnalytics(
      post.organizationId,
      post.brandId,
      post.externalId,
      credentialId,
    );
    const receivedAt = new Date();
    await admitAnalyticsCollection(authorization);
    await this.postAnalyticsService.processLinkedInAnalytics(
      post.id,
      {
        clicks: analytics.clicks,
        learningMetrics: analytics.learningMetrics,
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
        ...exposureCollectionContext(exposureSource, {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
        }),
        learningObservation: {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
          ...(publicationSource ? { publicationSource } : {}),
        },
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId: credentialId,
      },
      authorization,
    );
    await this.recordSnapshot(post, credentialId, analytics, authorization);
    return {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };
  }
  private async collectMastodon(
    post: AnalyticsCollectionPost,
    credentialId: string,
    publicationSource: LearningPublicationSourceV1 | null,
    sourceAttemptId: string,
    requestStartedAt: Date,
    exposureSource: BreakoutPublicationSourceV1 | null,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(authorization);
    const analytics = await this.mastodonService.getMediaAnalytics(
      post.organizationId,
      post.brandId,
      post.externalId,
      credentialId,
    );
    const receivedAt = new Date();
    await admitAnalyticsCollection(authorization);
    await this.postAnalyticsService.processMastodonAnalytics(
      post.id,
      analytics,
      {
        ...exposureCollectionContext(exposureSource, {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
        }),
        learningObservation: {
          sourceAttemptId,
          requestStartedAt,
          receivedAt,
          ...(publicationSource ? { publicationSource } : {}),
        },
        organizationId: post.organizationId,
        brandId: post.brandId,
        credentialId: credentialId,
      },
      authorization,
    );
    await this.recordSnapshot(post, credentialId, analytics, authorization);
    return {
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId,
    };
  }

  private async resolveCollectionCredential(
    post: AnalyticsCollectionPost,
    authorization?: AnalyticsCollectionAuthorization,
  ) {
    await admitAnalyticsCollection(authorization);
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
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<void> {
    await admitAnalyticsCollection(authorization);
    const counts = extractProfileCounts(analytics);
    await this.accountSnapshots.upsertDailySnapshot({
      brandId: post.brandId,
      credentialId,
      organizationId: post.organizationId,
      platform: post.platform,
      ...counts,
    });
    await admitAnalyticsCollection(authorization);
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
