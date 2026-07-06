import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import type { TwitterAnalyticsJobData } from '@genfeedai/queue-contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerLogger,
  type ServerPostAnalytics,
  type ServerTwitterAnalytics,
} from '@server/server.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class AnalyticsTwitterJobService {
  constructor(
    @Inject(SERVER_TOKENS.twitter)
    private readonly twitterService: ServerTwitterAnalytics,
    @Inject(SERVER_TOKENS.postAnalytics)
    private readonly postAnalyticsService: ServerPostAnalytics,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async process(
    job: AnalyticsQueueJob<TwitterAnalyticsJobData>,
  ): Promise<void> {
    const { posts, credentialId } = job.data;

    this.logger.log(
      `Processing Twitter analytics batch for ${posts.length} posts`,
    );

    try {
      await job.updateProgress(10);

      if (posts.length === 0) {
        this.logger.warn('No posts provided for Twitter analytics batch');
        return;
      }

      const credential: unknown = await this.credentialsService.findOne({
        _id: credentialId,
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

      await job.updateProgress(50);

      let processed = 0;
      for (const post of posts) {
        const analytics = analyticsMap.get(post.externalId);

        if (analytics) {
          await this.postAnalyticsService.processTwitterAnalytics(
            post.id,
            analytics,
          );
          processed++;
          continue;
        }

        this.logger.warn(
          `No analytics found for tweet ${post.externalId} (post ${post.id})`,
        );
      }

      await job.updateProgress(100);

      this.logger.log(
        `Twitter analytics batch completed - processed ${processed}/${posts.length} posts`,
      );
    } catch (error: unknown) {
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
