/**
 * One delayed post-watch attempt: fetch new replies under a post, enqueue inbound.
 */
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ReplyInboundQueueService } from '@api/queues/reply-bot/reply-inbound-queue.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { ReplyBotPlatform, ReplyBotType } from '@genfeedai/enums';
import type {
  ReplyPostWatchJobData,
  ReplyPostWatchResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class ReplyPostWatchService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly socialMonitorService: SocialMonitorService,
    @Optional()
    private readonly replyInboundQueueService:
      | ReplyInboundQueueService
      | undefined,
    private readonly processedTweetsService: ProcessedTweetsService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async runWatchAttempt(
    data: ReplyPostWatchJobData,
  ): Promise<ReplyPostWatchResult> {
    let commentsFound = 0;
    let enqueued = 0;

    try {
      const watchPlatform =
        data.platform === 'youtube'
          ? ReplyBotPlatform.YOUTUBE
          : ReplyBotPlatform.TWITTER;
      const wirePlatform =
        watchPlatform === ReplyBotPlatform.YOUTUBE ? 'youtube' : 'twitter';

      const comments = await this.socialMonitorService.getContentComments(
        watchPlatform,
        data.postId,
        {
          brandId: data.brandId,
          limit: 40,
          organizationId: data.organizationId,
          preferOfficialApi: true,
        },
      );
      commentsFound = comments.length;

      for (const comment of comments) {
        const already = await this.processedTweetsService.isProcessed(
          comment.id,
          data.organizationId,
          ReplyBotType.COMMENT_RESPONDER,
        );
        if (already) {
          continue;
        }

        const replyInboundQueueService = this.resolveReplyInboundQueueService();
        if (!replyInboundQueueService) {
          continue;
        }
        await replyInboundQueueService.enqueueInbound({
          brandId: data.brandId,
          commentAuthorId: comment.authorId,
          commentAuthorUsername: comment.authorUsername,
          commentId: comment.id,
          commentText: comment.text,
          organizationId: data.organizationId,
          parentPostId: data.postId,
          parentPostPreview: data.postPreview,
          platform: wirePlatform,
          receivedAt: new Date().toISOString(),
          source: 'post-watch',
        });
        enqueued += 1;
      }
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} watch attempt failed`, {
        attempt: data.attempt,
        error: error instanceof Error ? error.message : 'unknown',
        postId: data.postId,
      });
    }

    this.logger.log(`${this.constructorName} watch attempt complete`, {
      attempt: data.attempt,
      commentsFound,
      enqueued,
      postId: data.postId,
    });

    return {
      attempt: data.attempt,
      commentsFound,
      enqueued,
      organizationId: data.organizationId,
      postId: data.postId,
    };
  }

  private resolveReplyInboundQueueService():
    | ReplyInboundQueueService
    | undefined {
    if (this.replyInboundQueueService) {
      return this.replyInboundQueueService;
    }
    try {
      return this.moduleRef?.get(ReplyInboundQueueService, { strict: false });
    } catch {
      return undefined;
    }
  }
}
