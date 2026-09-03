import type { YouTubeAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import {
  attributionFailureFor,
  resolveAnalyticsCollectionCredential,
} from '@api/analytics/analytics-collection-credential';
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
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import { Inject, Injectable } from '@nestjs/common';
import {
  classifyAnalyticsCollectionError,
  delayedAnalyticsCollectionFailure,
} from '../analytics-collection-state';

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

  async collect(data: YouTubeAnalyticsCollectionInput): Promise<void> {
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
      const analyticsMap = await this.youtubeService.getMediaAnalyticsBatch(
        organizationId,
        brandId,
        videoIds,
        resolution.credentialId,
      );

      const readyTargets: AnalyticsCollectionAttemptRef[] = [];
      const delayedTargets: AnalyticsCollectionAttemptRef[] = [];
      const failedTargets: AnalyticsCollectionAttemptRef[] = [];
      let firstProcessingError: unknown;

      for (const post of posts) {
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
          );
          readyTargets.push(target);
        } catch (error: unknown) {
          firstProcessingError ??= error;
          this.logger.error(
            `Failed to process YouTube analytics for post ${post.id}`,
            error,
          );
          failedTargets.push(target);
        }
        settledPostIds.add(post.id);
      }

      await this.analyticsCollectionState.markReadyBatch(readyTargets);
      if (delayedTargets.length > 0) {
        await this.analyticsCollectionState.markFailedBatch(
          delayedTargets,
          delayedAnalyticsCollectionFailure('YouTube'),
        );
      }
      if (failedTargets.length > 0) {
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
        await this.recordSnapshot(data, resolution.credentialId, analyticsMap);
      }
    } catch (error: unknown) {
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

  private async recordSnapshot(
    data: YouTubeAnalyticsCollectionInput,
    credentialId: string,
    analyticsMap: Map<string, unknown>,
  ): Promise<void> {
    const counts = extractProfileCounts(
      [...analyticsMap.values()].find((value) => value != null),
    );
    if (
      counts.subscribers === undefined &&
      this.youtubeService.getChannelDetails
    ) {
      try {
        const details = await this.youtubeService.getChannelDetails(
          data.organizationId,
          data.brandId,
        );
        if (typeof details.subscriberCount === 'number') {
          counts.subscribers = details.subscriberCount;
        }
      } catch (error: unknown) {
        this.logger.warn(
          `YouTube profile snapshot skipped for credential ${credentialId}`,
          error,
        );
      }
    }

    await this.accountSnapshots.upsertDailySnapshot({
      brandId: data.brandId,
      credentialId,
      organizationId: data.organizationId,
      platform: CredentialPlatform.YOUTUBE,
      ...counts,
    });
  }
}
