import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
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
  SendDmExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';

export class WorkflowSocialExecutorRegistrarService {
  private readonly logContext = 'WorkflowEngineAdapterService';

  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    private readonly socialAdapterFactory?: SocialAdapterFactory,
    private readonly youtubeSocialAdapter?: YoutubeSocialAdapter,
    private readonly socialInboxService?: SocialInboxService,
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
    ]) {
      engine.registerExecutor(
        executor.nodeType,
        this.helper.wrapEngineExecutor(executor),
      );
    }
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

      if (params.platform === 'youtube') {
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
      if (params.platform === 'youtube') {
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
