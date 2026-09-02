import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { buildTwitterStatusUrl } from '@api/services/integrations/twitter/utils/twitter-post-id.util';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { INotificationPayloadTypes } from '@genfeedai/contracts/interfaces';
import {
  CommentTriggerExecutor,
  type DmSender,
  EngagementTriggerExecutor,
  KeywordTriggerExecutor,
  MentionTriggerExecutor,
  NewFollowerTriggerExecutor,
  NewLikeTriggerExecutor,
  NewRepostTriggerExecutor,
  PostReplyExecutor,
  type ReplyPublisher,
  ReportDeliveryExecutor,
  SendDmExecutor,
  SocialReadExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class WorkflowSocialExecutorRegistrarService {
  private readonly logContext = 'WorkflowEngineAdapterService';

  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly socialAdapterFactory?: SocialAdapterFactory,
    @Optional() private readonly youtubeSocialAdapter?: YoutubeSocialAdapter,
    @Optional() private readonly socialInboxService?: SocialInboxService,
    @Optional() private readonly twitterService?: TwitterService,
    @Optional() private readonly credentialsService?: CredentialsService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  register(engine: WorkflowEngine): void {
    const platforms = this.socialAdapterFactory?.getSupportedPlatforms() ?? [];
    const postReplyExecutor = new PostReplyExecutor();
    const sendDmExecutor = new SendDmExecutor();
    const followerTriggerExecutor = new NewFollowerTriggerExecutor();
    const mentionTriggerExecutor = new MentionTriggerExecutor();
    const likeTriggerExecutor = new NewLikeTriggerExecutor();
    const repostTriggerExecutor = new NewRepostTriggerExecutor();
    const keywordTriggerExecutor = new KeywordTriggerExecutor();
    const engagementTriggerExecutor = new EngagementTriggerExecutor();
    const commentTriggerExecutor = new CommentTriggerExecutor();
    const socialReadExecutor = new SocialReadExecutor();
    const reportDeliveryExecutor = new ReportDeliveryExecutor();

    if (
      this.socialAdapterFactory ||
      this.youtubeSocialAdapter ||
      this.socialInboxService
    ) {
      this.wireSocialExecutors({
        commentTriggerExecutor,
        engagementTriggerExecutor,
        followerTriggerExecutor,
        keywordTriggerExecutor,
        likeTriggerExecutor,
        mentionTriggerExecutor,
        postReplyExecutor,
        repostTriggerExecutor,
        sendDmExecutor,
      });

      const wiredPlatforms = this.youtubeSocialAdapter
        ? [...new Set([...platforms, 'youtube'])]
        : platforms;
      if (wiredPlatforms.length > 0) {
        this.loggerService.log(
          `${this.logContext} social executors wired for platforms: ${wiredPlatforms.join(', ')}`,
        );
      }
    }

    this.wireSocialReadExecutor(socialReadExecutor);
    this.wireReportDeliveryExecutor(reportDeliveryExecutor);

    for (const executor of [
      postReplyExecutor,
      sendDmExecutor,
      followerTriggerExecutor,
      mentionTriggerExecutor,
      likeTriggerExecutor,
      repostTriggerExecutor,
      keywordTriggerExecutor,
      engagementTriggerExecutor,
      commentTriggerExecutor,
      socialReadExecutor,
      reportDeliveryExecutor,
    ]) {
      engine.registerExecutor(
        executor.nodeType,
        this.helper.wrapEngineExecutor(executor),
      );
    }
  }

  private wireSocialReadExecutor(executor: SocialReadExecutor): void {
    if (!this.twitterService) {
      this.loggerService.warn(
        `${this.logContext} TwitterService unavailable — socialRead node will fail until wired`,
      );
      return;
    }

    const twitterService = this.twitterService;
    const credentialsService = this.credentialsService;

    executor.setProvider(async (params) => {
      if (params.platform !== 'twitter') {
        throw new Error(
          `socialRead does not support platform "${params.platform}" yet`,
        );
      }

      const limit = Math.min(Math.max(params.limit, 1), 50);
      let username = params.username?.replace(/^@/, '');
      let accessToken: string | undefined;

      if (params.brandId) {
        accessToken =
          (await twitterService.resolveBrandUserAccessToken(
            params.organizationId,
            params.brandId,
            params.credentialId,
          )) ?? undefined;

        if (!username && credentialsService) {
          // The handle has to come from the same account the token does,
          // otherwise a brand with two X accounts reads one account's timeline
          // through the other account's credentials.
          const credential = await credentialsService.resolveBrandAccount({
            brandId: params.brandId,
            credentialId: params.credentialId,
            organizationId: params.organizationId,
            platform: CredentialPlatform.TWITTER,
          });
          username = credential?.username?.replace(/^@/, '') || undefined;
        }
      }

      if (params.mode === 'search') {
        const query = params.query?.trim();
        if (!query) {
          throw new Error('query is required for socialRead search mode');
        }
        try {
          const tweets = await twitterService.searchRecentTweets(query, {
            maxResults: Math.min(Math.max(limit, 5), 25),
            sortOrder: 'recency',
          });
          return tweets.map((tweet) => ({
            authorName: tweet.authorName,
            authorUsername: tweet.authorUsername,
            createdAt: tweet.createdAt,
            engagement: tweet.engagement,
            id: tweet.id,
            likes: tweet.likes,
            replies: tweet.replies,
            retweets: tweet.retweets,
            text: tweet.text,
            url: buildTwitterStatusUrl(tweet.id, tweet.authorUsername),
          }));
        } catch (error: unknown) {
          throw formatSocialReadProviderError(error);
        }
      }

      if (params.mode === 'mentions') {
        if (!username) {
          throw new Error(
            'username or a brand with a connected X account is required for mentions mode',
          );
        }
        try {
          const tweets = await twitterService.searchRecentTweets(
            `@${username}`,
            {
              maxResults: Math.min(Math.max(limit, 5), 25),
              sortOrder: 'recency',
            },
          );
          return tweets.map((tweet) => ({
            authorName: tweet.authorName,
            authorUsername: tweet.authorUsername,
            createdAt: tweet.createdAt,
            engagement: tweet.engagement,
            id: tweet.id,
            likes: tweet.likes,
            replies: tweet.replies,
            retweets: tweet.retweets,
            text: tweet.text,
            url: buildTwitterStatusUrl(tweet.id, tweet.authorUsername),
          }));
        } catch (error: unknown) {
          throw formatSocialReadProviderError(error);
        }
      }

      // timeline
      if (!username) {
        throw new Error(
          'username or a brand with a connected X account is required for timeline mode',
        );
      }

      try {
        const posts = await twitterService.getUserTimelineByUsername(username, {
          accessToken,
          maxResults: limit,
        });

        return posts.map((post) => ({
          authorName: post.authorName,
          authorUsername: post.authorUsername ?? username,
          createdAt: post.createdAt?.toISOString?.() ?? undefined,
          id: post.id,
          likes: post.metrics?.likes,
          replies: post.metrics?.comments,
          retweets: post.metrics?.shares,
          text: post.text,
          url: buildTwitterStatusUrl(post.id, post.authorUsername ?? username),
        }));
      } catch (error: unknown) {
        throw formatSocialReadProviderError(error);
      }
    });
  }

  private wireReportDeliveryExecutor(executor: ReportDeliveryExecutor): void {
    const notifications = this.notificationsService;
    if (!notifications) {
      this.loggerService.warn(
        `${this.logContext} NotificationsService unavailable — reportDelivery node will fail until wired`,
      );
      return;
    }

    executor.setNotificationSender(async ({ userId, title, body }) => {
      try {
        await notifications.sendNotification({
          action: 'workflow_report',
          payload: {
            card: {
              description: body,
              title,
            },
          } satisfies INotificationPayloadTypes,
          type: 'discord',
          userId,
        });
      } catch (error: unknown) {
        throw formatReportDeliveryError('notification', error);
      }
    });

    executor.setEmailSender(async ({ to, subject, html }) => {
      try {
        await notifications.sendEmail(to, subject, html);
      } catch (error: unknown) {
        throw formatReportDeliveryError(`email:${to}`, error);
      }
    });

    executor.setOwnerResolver(async ({ userId }) => {
      // Recipient defaults to the executing user; callers may override email in node config.
      return { email: null, userId };
    });
  }

  private wireSocialExecutors(input: {
    postReplyExecutor: PostReplyExecutor;
    sendDmExecutor: SendDmExecutor;
    followerTriggerExecutor: NewFollowerTriggerExecutor;
    mentionTriggerExecutor: MentionTriggerExecutor;
    likeTriggerExecutor: NewLikeTriggerExecutor;
    repostTriggerExecutor: NewRepostTriggerExecutor;
    keywordTriggerExecutor: KeywordTriggerExecutor;
    engagementTriggerExecutor: EngagementTriggerExecutor;
    commentTriggerExecutor: CommentTriggerExecutor;
  }): void {
    const socialAdapterFactory = this.socialAdapterFactory;
    const youtubeSocialAdapter = this.youtubeSocialAdapter;

    input.postReplyExecutor.setPublisher((params) => {
      if (params.conversationId) {
        return this.publishSocialInboxReply(params);
      }

      if (params.platform === Platform.YOUTUBE) {
        if (!youtubeSocialAdapter) {
          throw new Error('YouTube social adapter is not available');
        }
        return youtubeSocialAdapter.createReplyPublisher()(params);
      }

      if (!socialAdapterFactory) {
        throw new Error(
          `${params.platform} social adapter factory is not available`,
        );
      }

      return socialAdapterFactory
        .getAdapter(params.platform)
        .createReplyPublisher()(params);
    });

    input.sendDmExecutor.setSender((params) => {
      if (params.conversationId) {
        return this.sendSocialInboxDm(params);
      }

      if (!socialAdapterFactory) {
        throw new Error(
          `${params.platform} social adapter factory is not available`,
        );
      }

      return socialAdapterFactory.getAdapter(params.platform).createDmSender()(
        params,
      );
    });

    input.followerTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createFollowerChecker) {
        throw new Error(
          `${params.platform} follower trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createFollowerChecker()(params);
    });
    input.mentionTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createMentionChecker) {
        throw new Error(
          `${params.platform} mention trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createMentionChecker()(params);
    });
    input.likeTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createLikeChecker) {
        throw new Error(
          `${params.platform} like trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createLikeChecker()(params);
    });
    input.repostTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createRepostChecker) {
        throw new Error(
          `${params.platform} repost trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createRepostChecker()(params);
    });
    input.keywordTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createKeywordChecker) {
        throw new Error(
          `${params.platform} keyword trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createKeywordChecker()(params);
    });
    input.engagementTriggerExecutor.setChecker((params) => {
      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createEngagementChecker) {
        throw new Error(
          `${params.platform} engagement trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createEngagementChecker()(params);
    });
    input.commentTriggerExecutor.setChecker((params) => {
      if (params.platform === Platform.YOUTUBE) {
        if (!youtubeSocialAdapter) {
          throw new Error('YouTube social adapter is not available');
        }
        return youtubeSocialAdapter.createCommentChecker()(params);
      }

      const adapter = requireSocialAdapter(
        socialAdapterFactory,
        params.platform,
      );
      if (!adapter.createCommentChecker) {
        throw new Error(
          `${params.platform} comment trigger is not supported by the configured social adapter`,
        );
      }
      return adapter.createCommentChecker()(params);
    });
  }

  private async publishSocialInboxReply(
    params: Parameters<ReplyPublisher>[0],
  ): Promise<{ replyId: string; replyUrl: string }> {
    if (!this.socialInboxService) {
      throw new Error('Social inbox action service is not available');
    }
    if (!params.conversationId) {
      throw new Error('conversationId is required for social inbox replies');
    }

    const message = await this.socialInboxService.postReply(
      {
        brandId: params.brandId,
        organizationId: params.organizationId,
        userId: params.userId,
      },
      params.conversationId,
      {
        idempotencyKey: params.idempotencyKey,
        text: params.text,
        workflowRunId: params.workflowRunId,
      },
    );

    return {
      replyId: message.externalMessageId ?? message.id,
      replyUrl: message.sourceUrl ?? '',
    };
  }

  private async sendSocialInboxDm(
    params: Parameters<DmSender>[0],
  ): Promise<{ messageId: string }> {
    if (!this.socialInboxService) {
      throw new Error('Social inbox action service is not available');
    }
    if (!params.conversationId) {
      throw new Error('conversationId is required for social inbox DMs');
    }

    const message = await this.socialInboxService.sendDm(
      {
        brandId: params.brandId,
        organizationId: params.organizationId,
        userId: params.userId,
      },
      params.conversationId,
      {
        idempotencyKey: params.idempotencyKey,
        recipientId: params.recipientId,
        text: params.text,
        workflowRunId: params.workflowRunId,
      },
    );

    return { messageId: message.externalMessageId ?? message.id };
  }
}

function requireSocialAdapter(
  socialAdapterFactory: SocialAdapterFactory | undefined,
  platform: string,
) {
  if (!socialAdapterFactory) {
    throw new Error(`${platform} social adapter factory is not available`);
  }

  return socialAdapterFactory.getAdapter(platform);
}

interface TwitterProviderErrorShape {
  code?: number;
  message?: string;
  rateLimit?: { reset?: string | number };
  rateLimitReset?: Date | string;
}

function readProviderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as TwitterProviderErrorShape).message === 'string'
  ) {
    return (error as TwitterProviderErrorShape).message ?? String(error);
  }
  return String(error);
}

function readRateLimitResetIso(
  error: TwitterProviderErrorShape,
): string | undefined {
  const resetRaw = error.rateLimitReset ?? error.rateLimit?.reset;
  if (resetRaw instanceof Date) {
    return resetRaw.toISOString();
  }
  if (typeof resetRaw === 'number' || typeof resetRaw === 'string') {
    const numeric = Number(resetRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      const millis = numeric > 1e12 ? numeric : numeric * 1000;
      return new Date(millis).toISOString();
    }
    if (typeof resetRaw === 'string') {
      const parsed = new Date(resetRaw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  return undefined;
}

/** Diagnosable socialRead provider failure (#2664 phase 3). */
export function formatSocialReadProviderError(error: unknown): Error {
  const shape = (
    typeof error === 'object' && error !== null ? error : {}
  ) as TwitterProviderErrorShape;
  const message = readProviderErrorMessage(error);
  const isRateLimit =
    shape.code === 429 ||
    Boolean(shape.rateLimit) ||
    /rate[\s_-]?limit/i.test(message);

  if (isRateLimit) {
    const resetIso = readRateLimitResetIso(shape);
    return new Error(
      resetIso
        ? `socialRead twitter rate limited; reset at ${resetIso}`
        : 'socialRead twitter rate limited',
    );
  }

  return new Error(`socialRead twitter provider failed: ${message}`);
}

/** Diagnosable reportDelivery failure with destination (#2664 phase 3). */
export function formatReportDeliveryError(
  destination: string,
  error: unknown,
): Error {
  return new Error(
    `reportDelivery ${destination} failed: ${readProviderErrorMessage(error)}`,
  );
}
