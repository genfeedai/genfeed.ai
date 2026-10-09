import { randomUUID } from 'node:crypto';
import type {
  AnalyticsCollectionAuthorization,
  YouTubeAnalyticsCollectionInput,
} from '@api/analytics/analytics-collection-action.types';
import {
  admitAnalyticsCollection,
  isAnalyticsCollectionAuthorizationFailure,
} from '@api/analytics/analytics-collection-authorization';
import {
  attributionFailureFor,
  resolveAnalyticsCollectionCredential,
} from '@api/analytics/analytics-collection-credential';
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
  type ServerYouTubeAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsPersistenceContext,
  BreakoutPublicationSourceV1,
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { Inject, Injectable } from '@nestjs/common';
import {
  classifyAnalyticsCollectionError,
  delayedAnalyticsCollectionFailure,
} from '../analytics-collection-state';

type YouTubeBatchOutcome = {
  readyTargets: AnalyticsCollectionAttemptRef[];
  delayedTargets: AnalyticsCollectionAttemptRef[];
  failedTargets: AnalyticsCollectionAttemptRef[];
  firstProcessingError: unknown;
};
@Injectable()
export class AnalyticsYouTubeCollectionService {
  constructor(
    @Inject(SERVER_TOKENS.youtube)
    private readonly youtubeService: ServerYouTubeAnalytics,
    @Inject(SERVER_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerPostAnalytics,
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
    private readonly accountSnapshots: AccountAnalyticsSnapshotService,
  ) {}

  async collect(
    data: YouTubeAnalyticsCollectionInput,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<AnalyticsPersistenceContext> {
    await admitAnalyticsCollection(
      authorization,
      data.posts[0]?.organizationId,
    );
    const { posts, organizationId, brandId } = data;

    this.logger.log(
      `Processing YouTube analytics batch for ${posts.length} posts`,
    );

    // Posts whose outcome has already been recorded. The outer catch is a
    // batch-level handler; without this it would overwrite per-post results.
    const settledPostIds = new Set<string>();

    try {
      if (posts.length !== 1) {
        throw new Error('YouTube analytics action requires exactly one post');
      }

      const videoIds = posts.map((post) => post.externalId);
      const resolution = await this.resolveCollectionCredential(
        data,
        authorization,
      );
      const observations = new Map<
        string,
        LearningPublicationSourceV1 | null
      >();
      for (const post of posts) {
        await admitAnalyticsCollection(authorization);
        observations.set(
          post.id,
          await this.postAnalyticsService.prepareLearningObservation({
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: resolution.credentialId,
            postId: post.id,
            platform: CredentialPlatform.YOUTUBE,
            externalId: post.externalId,
          }),
        );
      }
      const exposureSources = new Map<
        string,
        BreakoutPublicationSourceV1 | null
      >();
      for (const post of posts) {
        await admitAnalyticsCollection(authorization);
        exposureSources.set(
          post.id,
          await prepareExposureCollectionSource(this.postAnalyticsService, {
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: resolution.credentialId,
            postId: post.id,
            platform: CredentialPlatform.YOUTUBE,
            externalId: post.externalId,
          }),
        );
      }
      await admitAnalyticsCollection(authorization);
      const sourceAttemptId = randomUUID(),
        requestStartedAt = new Date();
      const analyticsMap = await this.youtubeService.getMediaAnalyticsBatch(
        organizationId,
        brandId,
        videoIds,
        resolution.credentialId,
      );

      const receivedAt = new Date();
      await admitAnalyticsCollection(authorization);
      const {
        readyTargets,
        delayedTargets,
        failedTargets,
        firstProcessingError,
      } = await this.persistYouTubeBatch(
        data,
        analyticsMap,
        observations,
        resolution.credentialId,
        sourceAttemptId,
        requestStartedAt,
        receivedAt,
        settledPostIds,
        exposureSources,
        authorization,
      );
      await admitAnalyticsCollection(authorization);
      await this.analyticsCollectionState.markReadyBatch(readyTargets);
      if (delayedTargets.length > 0) {
        await admitAnalyticsCollection(authorization);
        await this.analyticsCollectionState.markFailedBatch(
          delayedTargets,
          delayedAnalyticsCollectionFailure('YouTube'),
        );
      }
      if (failedTargets.length > 0) {
        await admitAnalyticsCollection(authorization);
        await this.analyticsCollectionState.markFailedBatch(
          failedTargets,
          classifyAnalyticsCollectionError(firstProcessingError, 'YouTube'),
        );
      }

      if (firstProcessingError) {
        throw firstProcessingError;
      }
      if (delayedTargets.length > 0) {
        throw new Error(
          `YouTube analytics are not available for post ${delayedTargets[0]?.id ?? 'unknown'}`,
        );
      }

      this.logger.log(
        `YouTube analytics batch completed - processed ${readyTargets.length}/${posts.length} posts`,
      );

      if (readyTargets.length > 0) {
        await admitAnalyticsCollection(authorization);
        await this.recordSnapshot(
          data,
          resolution.credentialId,
          analyticsMap,
          authorization,
        );
      }
      await admitAnalyticsCollection(authorization);
      return { organizationId, brandId, credentialId: resolution.credentialId };
    } catch (error: unknown) {
      if (isAnalyticsCollectionAuthorizationFailure(error)) throw error;
      await admitAnalyticsCollection(authorization);
      const failure = classifyAnalyticsCollectionError(error, 'YouTube');
      const unsettledPosts = posts.filter(
        (post) => !settledPostIds.has(post.id),
      );
      if (unsettledPosts.length > 0) {
        await this.analyticsCollectionState.markFailedBatch(
          unsettledPosts.map((post) => ({
            attemptKey: data.attemptKey,
            brandId: post.brandId,
            id: post.id,
            organizationId: post.organizationId,
            platform: CredentialPlatform.YOUTUBE,
          })),
          failure,
        );
      }
      this.logger.error(
        `Failed to process YouTube analytics batch for ${posts.length} posts`,
        error,
      );
      throw error;
    }
  }

  private async persistYouTubeBatch(
    data: YouTubeAnalyticsCollectionInput,
    analyticsMap: Awaited<
      ReturnType<ServerYouTubeAnalytics['getMediaAnalyticsBatch']>
    >,
    observations: Map<string, LearningPublicationSourceV1 | null>,
    credentialId: string,
    sourceAttemptId: string,
    requestStartedAt: Date,
    receivedAt: Date,
    settledPostIds: Set<string>,
    exposureSources: Map<string, BreakoutPublicationSourceV1 | null>,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<YouTubeBatchOutcome> {
    const { posts } = data;
    const readyTargets: AnalyticsCollectionAttemptRef[] = [];
    const delayedTargets: AnalyticsCollectionAttemptRef[] = [];
    const failedTargets: AnalyticsCollectionAttemptRef[] = [];
    let firstProcessingError: unknown;

    for (const post of posts) {
      await admitAnalyticsCollection(authorization);
      const analytics = analyticsMap.get(post.externalId);
      const target: AnalyticsCollectionAttemptRef = {
        attemptKey: data.attemptKey,
        brandId: post.brandId,
        id: post.id,
        organizationId: post.organizationId,
        platform: CredentialPlatform.YOUTUBE,
      };

      if (!analytics) {
        this.logger.warn(
          `No analytics found for video ${post.externalId} (post ${post.id})`,
        );
        delayedTargets.push(target);
        settledPostIds.add(post.id);
        continue;
      }

      // Per-post isolation. Persistence runs inside the loop while the
      // batch outcome is only written after it, so an unguarded throw on
      // post N escaped to the outer catch and marked posts 1..N-1 FAILED
      // even though their analytics had already been written — the retry
      // then re-processed rows that had succeeded.
      try {
        await this.postAnalyticsService.processYouTubeAnalytics(
          post.id,
          analytics,
          {
            ...exposureCollectionContext(exposureSources.get(post.id), {
              sourceAttemptId,
              requestStartedAt,
              receivedAt,
            }),
            learningObservation: {
              sourceAttemptId,
              requestStartedAt,
              receivedAt,
              ...(observations.get(post.id)
                ? { publicationSource: observations.get(post.id) ?? undefined }
                : {}),
            },
            organizationId: post.organizationId,
            brandId: post.brandId,
            credentialId: credentialId,
          },
          authorization,
        );
        readyTargets.push(target);
      } catch (error: unknown) {
        if (isAnalyticsCollectionAuthorizationFailure(error)) throw error;
        firstProcessingError ??= error;
        this.logger.error(
          `Failed to process YouTube analytics for post ${post.id}`,
          error,
        );
        failedTargets.push(target);
      }
      settledPostIds.add(post.id);
    }

    return {
      readyTargets,
      delayedTargets,
      failedTargets,
      firstProcessingError,
    };
  }
  private async resolveCollectionCredential(
    data: YouTubeAnalyticsCollectionInput,
    authorization?: AnalyticsCollectionAuthorization,
  ) {
    await admitAnalyticsCollection(authorization);
    const { organizationId, brandId } = data;
    const resolution = await resolveAnalyticsCollectionCredential({
      brandId,
      credentialId: data.credentialId,
      lookup: this.credentialsService,
      organizationId,
      platform: CredentialPlatform.YOUTUBE,
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
    data: YouTubeAnalyticsCollectionInput,
    credentialId: string,
    analyticsMap: Map<string, unknown>,
    authorization?: AnalyticsCollectionAuthorization,
  ): Promise<void> {
    const counts = extractProfileCounts(
      [...analyticsMap.values()].find((value) => value != null),
    );
    if (
      counts.subscribers === undefined &&
      this.youtubeService.getChannelDetails
    ) {
      try {
        await admitAnalyticsCollection(authorization);
        const details = await this.youtubeService.getChannelDetails(
          data.organizationId,
          data.brandId,
        );
        await admitAnalyticsCollection(authorization);
        if (typeof details.subscriberCount === 'number') {
          counts.subscribers = details.subscriberCount;
        }
      } catch (error: unknown) {
        if (isAnalyticsCollectionAuthorizationFailure(error)) throw error;
        this.logger.warn(
          `YouTube profile snapshot skipped for credential ${credentialId}`,
          error,
        );
      }
    }

    await admitAnalyticsCollection(authorization);
    await this.accountSnapshots.upsertDailySnapshot({
      brandId: data.brandId,
      credentialId,
      organizationId: data.organizationId,
      platform: CredentialPlatform.YOUTUBE,
      ...counts,
    });
  }
}
