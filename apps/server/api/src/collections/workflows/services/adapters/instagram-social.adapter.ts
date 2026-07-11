import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type { DmSender, ReplyPublisher } from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Instagram Social Adapter
 *
 * Implements only Instagram workflow capabilities backed by real APIs.
 * Each method is a bound function that can be injected directly into executors.
 */
@Injectable()
export class InstagramSocialAdapter {
  private readonly logContext = 'InstagramSocialAdapter';

  readonly createFollowerChecker?: undefined;
  readonly createMentionChecker?: undefined;
  readonly createLikeChecker?: undefined;
  readonly createRepostChecker?: undefined;

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
      if (!recipientId) {
        throw new Error('recipientId is required for Instagram DM sending');
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
}
