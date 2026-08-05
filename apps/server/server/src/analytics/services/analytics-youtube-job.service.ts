import { CredentialPlatform } from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  ServerAnalyticsCollectionState,
} from '@genfeedai/interfaces';
import type { YouTubeAnalyticsJobData } from '@genfeedai/queue-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerYouTubeAnalytics,
} from '@server/server.dependencies';
import {
  classifyAnalyticsCollectionError,
  delayedAnalyticsCollectionFailure,
} from '../analytics-collection-state';
import type { AnalyticsQueueJob } from '../analytics-job.types';

@Injectable()
export class AnalyticsYouTubeJobService {
  constructor(
    @Inject(SERVER_TOKENS.youtube)
    private readonly youtubeService: ServerYouTubeAnalytics,
    @Inject(SERVER_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerPostAnalytics,
    @Inject(SERVER_TOKENS.analyticsCollectionState)
    private readonly analyticsCollectionState: ServerAnalyticsCollectionState,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async process(
    job: AnalyticsQueueJob<YouTubeAnalyticsJobData>,
  ): Promise<void> {
    const { posts, organizationId, brandId } = job.data;

    this.logger.log(
      `Processing YouTube analytics batch for ${posts.length} posts`,
    );

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for YouTube analytics batch');
        return;
      }

      const videoIds = posts.map((post) => post.externalId);
      const analyticsMap = await this.youtubeService.getMediaAnalyticsBatch(
        organizationId,
        brandId,
        videoIds,
      );

      await job.updateProgress(50);

      const readyTargets: AnalyticsCollectionAttemptRef[] = [];
      const delayedTargets: AnalyticsCollectionAttemptRef[] = [];

      for (const post of posts) {
        const analytics = analyticsMap.get(post.externalId);
        const target: AnalyticsCollectionAttemptRef = {
          attemptKey: job.data.attemptKey,
          brandId: post.brandId,
          id: post.id,
          organizationId: post.organizationId,
          platform: CredentialPlatform.YOUTUBE,
        };

        if (analytics) {
          await this.postAnalyticsService.processYouTubeAnalytics(
            post.id,
            analytics,
          );
          readyTargets.push(target);
          continue;
        }

        this.logger.warn(
          `No analytics found for video ${post.externalId} (post ${post.id})`,
        );
        delayedTargets.push(target);
      }

      await this.analyticsCollectionState.markReadyBatch(readyTargets);
      if (delayedTargets.length > 0) {
        await this.analyticsCollectionState.markFailedBatch(
          delayedTargets,
          delayedAnalyticsCollectionFailure('YouTube'),
        );
      }

      await job.updateProgress(100);

      this.logger.log(
        `YouTube analytics batch completed - processed ${readyTargets.length}/${posts.length} posts`,
      );
    } catch (error: unknown) {
      const failure = classifyAnalyticsCollectionError(error, 'YouTube');
      await this.analyticsCollectionState.markFailedBatch(
        posts.map((post) => ({
          attemptKey: job.data.attemptKey,
          brandId: post.brandId,
          id: post.id,
          organizationId: post.organizationId,
          platform: CredentialPlatform.YOUTUBE,
        })),
        failure,
      );
      this.logger.error(
        `Failed to process YouTube analytics batch for ${posts.length} posts`,
        error,
      );
      throw error;
    }
  }
}
