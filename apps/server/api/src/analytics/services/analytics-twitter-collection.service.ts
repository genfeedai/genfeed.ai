import type { TwitterAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerTwitterAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  AnalyticsCollectionAttemptRef,
  IReplyBotCredentialData,
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Inject, Injectable } from '@nestjs/common';
import {
  classifyAnalyticsCollectionError,
  delayedAnalyticsCollectionFailure,
} from '../analytics-collection-state';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class AnalyticsTwitterCollectionService {
  constructor(
    @Inject(SERVER_TOKENS.twitter)
    private readonly twitterService: ServerTwitterAnalytics,
    @Inject(SERVER_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerPostAnalytics,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async collect(data: TwitterAnalyticsCollectionInput): Promise<void> {
    const { posts, credentialId } = data;

    this.logger.log(
      `Processing Twitter analytics batch for ${posts.length} posts`,
    );

    // Posts whose outcome has already been recorded. The outer catch is a
    // batch-level handler; without this it would overwrite per-post results.
    const settledPostIds = new Set<string>();

    try {
      if (posts.length !== 1) {
        throw new Error('Twitter analytics action requires exactly one post');
      }

      const credential: unknown = await this.credentialsService.findOne({
        id: credentialId,
      });

      if (!credential) {
        this.logger.error(`Credential ${credentialId} not found`);
        throw new Error(`Credential ${credentialId} not found`);
      }

      const credentialData = this.buildCredentialData(credential);
      const tweetIds = posts.map((post) => post.externalId);
      const analyticsMap = await this.twitterService.getMediaAnalyticsBatch(
        tweetIds,
        credentialData.accessToken,
        credentialData.accessTokenSecret,
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
          platform: CredentialPlatform.TWITTER,
        };

        if (!analytics) {
          this.logger.warn(
            `No analytics found for tweet ${post.externalId} (post ${post.id})`,
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
          await this.postAnalyticsService.processTwitterAnalytics(
            post.id,
            analytics,
          );
          readyTargets.push(target);
        } catch (error: unknown) {
          firstProcessingError ??= error;
          this.logger.error(
            `Failed to process Twitter analytics for post ${post.id}`,
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
          delayedAnalyticsCollectionFailure('Twitter'),
        );
      }
      if (failedTargets.length > 0) {
        await this.analyticsCollectionState.markFailedBatch(
          failedTargets,
          classifyAnalyticsCollectionError(firstProcessingError, 'Twitter'),
        );
      }

      if (firstProcessingError) {
        throw firstProcessingError;
      }
      if (delayedTargets.length > 0) {
        throw new Error(
          `Twitter analytics are not available for post ${delayedTargets[0]?.id ?? 'unknown'}`,
        );
      }

      this.logger.log(
        `Twitter analytics batch completed - processed ${readyTargets.length}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      const failure = classifyAnalyticsCollectionError(error, 'Twitter');
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
            platform: CredentialPlatform.TWITTER,
          })),
          failure,
        );
      }
      if (!this.isRateLimitError(error)) {
        this.logger.error(
          `Failed to process Twitter analytics batch for ${posts.length} posts`,
          error,
        );
      }

      throw error;
    }
  }

  private buildCredentialData(credential: unknown): IReplyBotCredentialData {
    if (
      !isPlainObject(credential) ||
      typeof credential.accessToken !== 'string'
    ) {
      throw new Error('Twitter analytics credential missing accessToken');
    }

    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken),
      accessTokenSecret:
        typeof credential.accessTokenSecret === 'string'
          ? EncryptionUtil.decrypt(credential.accessTokenSecret)
          : undefined,
    };
  }

  private isRateLimitError(error: unknown): boolean {
    return isPlainObject(error) && 'rateLimitReset' in error;
  }
}
