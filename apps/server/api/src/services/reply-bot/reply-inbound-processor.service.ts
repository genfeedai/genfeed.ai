/**
 * Shared processor for inbound reply jobs (XAA, post-watch, manual).
 */
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import {
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import { ReplyBotType } from '@genfeedai/enums';
import type {
  ReplyInboundJobData,
  ReplyInboundResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReplyInboundProcessorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly authorReplyLoopService: AuthorReplyLoopService,
  ) {}

  async process(data: ReplyInboundJobData): Promise<ReplyInboundResult> {
    const already = await this.processedTweetsService.isProcessed(
      data.commentId,
      data.organizationId,
      ReplyBotType.COMMENT_RESPONDER,
    );
    if (already) {
      return {
        commentId: data.commentId,
        organizationId: data.organizationId,
        skipped: true,
        success: true,
      };
    }

    const intent = resolveReplyIntent(data.commentText);
    const persona = getReplyIntentPersona(intent);
    if (persona.shouldSkipAuto) {
      await this.processedTweetsService.markAsProcessed(
        data.commentId,
        data.organizationId,
        ReplyBotType.COMMENT_RESPONDER,
      );
      this.logger.log(`${this.constructorName} skipped spam/low-signal`, {
        commentId: data.commentId,
        intent,
      });
      return {
        commentId: data.commentId,
        organizationId: data.organizationId,
        skipped: true,
        success: true,
      };
    }

    if (!data.brandId) {
      this.logger.warn(
        `${this.constructorName} missing brandId — cannot auto-send`,
        { commentId: data.commentId },
      );
      return {
        commentId: data.commentId,
        error: 'brandId required for auto-send',
        organizationId: data.organizationId,
        skipped: true,
        success: false,
      };
    }

    const botUserId =
      await this.authorReplyLoopService.findResponderOwnerUserId(
        data.organizationId,
        data.brandId,
      );
    if (!botUserId) {
      return {
        commentId: data.commentId,
        error: 'no reply bot owner — enable auto-replies for this brand first',
        organizationId: data.organizationId,
        skipped: true,
        success: false,
      };
    }

    try {
      const result = await this.authorReplyLoopService.sendReply({
        brandId: data.brandId,
        commentAuthor: data.commentAuthorUsername,
        commentAuthorId: data.commentAuthorId,
        commentId: data.commentId,
        commentText: data.commentText,
        intent,
        organizationId: data.organizationId,
        parentPostId: data.parentPostId,
        parentPostPreview: data.parentPostPreview,
        platform: data.platform === 'youtube' ? 'youtube' : 'twitter',
        userId: botUserId,
      });

      return {
        commentId: data.commentId,
        error: result.error,
        organizationId: data.organizationId,
        skipped: false,
        success: result.success,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`${this.constructorName} failed`, {
        commentId: data.commentId,
        error: message,
      });
      return {
        commentId: data.commentId,
        error: message,
        organizationId: data.organizationId,
        skipped: false,
        success: false,
      };
    }
  }
}
