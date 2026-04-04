import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type {
  DmSender,
  MentionChecker,
  NewFollowerChecker,
  NewLikeChecker,
  NewRepostChecker,
  ReplyPublisher,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Instagram Social Adapter
 *
 * Implements all 6 social workflow resolver interfaces using InstagramService.
 * Each method is a bound function that can be injected directly into executors.
 */
@Injectable()
export class InstagramSocialAdapter {
  private readonly logContext = 'InstagramSocialAdapter';

  constructor(
    private readonly instagramService: InstagramService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Creates a ReplyPublisher for PostReplyExecutor.
   * Posts a comment reply on an Instagram media using postComment.
   */
  createReplyPublisher(): ReplyPublisher {
    return async (params) => {
      const { organizationId, brandId: explicitBrandId, postId, text } = params;

      if (!explicitBrandId) {
        throw new Error('brandId is required for Instagram reply publishing');
      }
      const brandId = explicitBrandId;

      this.loggerService.debug(`${this.logContext} replying to post`, {
        brandId,
        organizationId,
        postId,
      });

      const result = await this.instagramService.postComment(
        organizationId,
        brandId,
        postId,
        text,
      );

      return {
        replyId: result.commentId,
        replyUrl: `https://www.instagram.com/p/${postId}/`, // approximate URL
      };
    };
  }

  /**
   * Creates a DmSender for SendDmExecutor.
   * Sends a DM via Instagram Messaging API.
   */
  createDmSender(): DmSender {
    return async (params) => {
      const {
        organizationId,
        brandId: explicitBrandId,
        recipientId,
        text,
      } = params;

      if (!explicitBrandId) {
        throw new Error('brandId is required for Instagram DM sending');
      }
      const brandId = explicitBrandId;

      this.loggerService.debug(`${this.logContext} sending DM`, {
        brandId,
        organizationId,
        recipientId,
      });

      const messageId = await this.instagramService.sendCommentReplyDm(
        organizationId,
        brandId,
        recipientId,
        text,
      );

      return { messageId: messageId ?? `ig_dm_${Date.now()}` };
    };
  }

  /**
   * Creates a NewFollowerChecker for NewFollowerTriggerExecutor.
   * NOTE: Instagram Graph API doesn't provide a follower list endpoint
   * for business accounts in a way that supports polling.
   */
  createFollowerChecker(): NewFollowerChecker {
    return async (params) => {
      this.loggerService.debug(`${this.logContext} checking new followers`, {
        organizationId: params.organizationId,
        platform: params.platform,
      });

      throw new Error(
        'Instagram follower trigger not yet implemented — requires Instagram webhooks or periodic follower count diff.',
      );
    };
  }

  /**
   * Creates a MentionChecker for MentionTriggerExecutor.
   * NOTE: Instagram Graph API supports mentioned_media endpoint.
   */
  createMentionChecker(): MentionChecker {
    return async (params) => {
      this.loggerService.debug(`${this.logContext} checking mentions`, {
        organizationId: params.organizationId,
        platform: params.platform,
      });

      throw new Error(
        'Instagram mention trigger not yet implemented — requires Instagram Graph API GET /{ig-user-id}/tags.',
      );
    };
  }

  /**
   * Creates a NewLikeChecker for NewLikeTriggerExecutor.
   */
  createLikeChecker(): NewLikeChecker {
    return async (params) => {
      this.loggerService.debug(`${this.logContext} checking new likes`, {
        organizationId: params.organizationId,
        platform: params.platform,
      });

      throw new Error(
        'Instagram like trigger not yet implemented — requires Instagram webhooks or media insights polling.',
      );
    };
  }

  /**
   * Creates a NewRepostChecker for NewRepostTriggerExecutor.
   */
  createRepostChecker(): NewRepostChecker {
    return async (params) => {
      this.loggerService.debug(`${this.logContext} checking new reposts`, {
        organizationId: params.organizationId,
        platform: params.platform,
      });

      throw new Error(
        'Instagram repost trigger not yet implemented — Instagram does not natively support repost detection.',
      );
    };
  }
}
