import type { SocialAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import { classifyAnalyticsCollectionError } from '@api/analytics/analytics-collection-state';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailedTarget,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

export type AnalyticsCollectionResult = {
  failed: number;
  processed: number;
  requested: number;
};

@Injectable()
export class AnalyticsProviderCollectionService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly threadsService: ThreadsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly collectionState: PostAnalyticsCollectionStateService,
    private readonly postsService: PostsService,
    private readonly logger: LoggerService,
  ) {}

  async collectFacebook(
    data: SocialAnalyticsCollectionInput,
  ): Promise<AnalyticsCollectionResult> {
    return this.collectPosts(data, 'Facebook', async (post) => {
      const credential = await this.credentialsService.findOne({
        ...(post.credentialId
          ? { id: post.credentialId }
          : { brandId: post.brandId }),
        isDeleted: false,
        organizationId: post.organizationId,
        platform: CredentialPlatform.FACEBOOK,
      });
      if (!credential?.accessToken) {
        throw Object.assign(
          new Error(`No Facebook credential found for post ${post.id}`),
          { status: 401 },
        );
      }
      const analytics = await this.facebookService.getPostAnalytics(
        post.externalId,
        EncryptionUtil.decrypt(credential.accessToken),
      );
      await this.postAnalyticsService.processFacebookAnalytics(post.id, {
        comments: analytics.comments,
        engagementRate: analytics.engagementRate,
        impressions: analytics.impressions,
        likes: analytics.likes,
        reach: analytics.reach,
        shares: analytics.shares,
        views: analytics.views,
      });
    });
  }

  async collectThreads(
    data: SocialAnalyticsCollectionInput,
  ): Promise<AnalyticsCollectionResult> {
    return this.collectPosts(data, 'Threads', async (post) => {
      const analytics = await this.threadsService.getThreadInsights(
        post.organizationId,
        post.brandId,
        post.externalId,
        post.credentialId,
      );
      await this.postAnalyticsService.processThreadsAnalytics(
        post.id,
        analytics,
      );
    });
  }

  private async collectPosts(
    data: SocialAnalyticsCollectionInput,
    platformLabel: string,
    collect: (
      post: SocialAnalyticsCollectionInput['posts'][number],
    ) => Promise<void>,
  ): Promise<AnalyticsCollectionResult> {
    if (data.posts.length !== 1) {
      throw new Error(`${platformLabel} analytics action requires one post`);
    }
    const post = data.posts[0];
    if (!post) {
      throw new Error(`${platformLabel} analytics action requires one post`);
    }
    const target = this.target(data.attemptKey, post);
    try {
      await collect(post);
      await this.collectionState.markReady(target);
    } catch (error: unknown) {
      const failure = classifyAnalyticsCollectionError(error, platformLabel);
      const failedTarget: AnalyticsCollectionFailedTarget = {
        ...target,
        failure,
      };
      await this.collectionState.markFailedTargets([failedTarget]);
      this.logger.error(
        `Failed to collect ${platformLabel} analytics for post ${post.id}`,
        error,
      );
      if (!failure.isRetryable) {
        await this.disableAnalytics(post.id);
      }
      throw error;
    }

    return {
      failed: 0,
      processed: 1,
      requested: 1,
    };
  }

  private async disableAnalytics(postId: string): Promise<void> {
    try {
      await this.postsService.patch(postId, { isAnalyticsEnabled: false });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to disable analytics after a terminal collection error for post ${postId}`,
        error,
      );
    }
  }

  private target(
    attemptKey: string | undefined,
    post: SocialAnalyticsCollectionInput['posts'][number],
  ): AnalyticsCollectionAttemptRef {
    return {
      attemptKey,
      brandId: post.brandId,
      id: post.id,
      organizationId: post.organizationId,
      platform: post.platform,
    };
  }
}
