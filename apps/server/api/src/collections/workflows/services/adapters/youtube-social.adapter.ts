import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import type {
  CommentChecker,
  CommentTriggerOutput,
  ReplyPublisher,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class YoutubeSocialAdapter {
  private readonly logContext = 'YoutubeSocialAdapter';

  constructor(
    private readonly youtubeService: YoutubeService,
    private readonly loggerService: LoggerService,
  ) {}

  createReplyPublisher(): ReplyPublisher {
    return async (params) => {
      const { organizationId, brandId, postId, text } = params;

      if (!brandId) {
        throw new Error('brandId is required for YouTube comment replies');
      }

      this.loggerService.debug(`${this.logContext} replying to comment`, {
        brandId,
        organizationId,
        parentCommentId: postId,
      });

      const result = await this.youtubeService.replyToComment(
        organizationId,
        brandId,
        postId,
        text,
      );

      return {
        replyId: result.commentId,
        replyUrl: `https://www.youtube.com/comment/${result.commentId}`,
      };
    };
  }

  createCommentChecker(): CommentChecker {
    return async (params) => {
      const {
        organizationId,
        brandId,
        contentIds,
        keywords,
        excludeKeywords,
        lastCommentId,
      } = params;

      if (!brandId) {
        throw new Error('brandId is required for YouTube comment polling');
      }

      const result = await this.youtubeService.listRecentChannelComments(
        organizationId,
        brandId,
        { maxResults: 50 },
      );

      for (const comment of result.comments) {
        if (comment.commentId === lastCommentId) {
          break;
        }

        if (contentIds.length > 0 && !contentIds.includes(comment.videoId)) {
          continue;
        }

        if (
          !this.matchesKeywordFilters(comment.text, keywords, excludeKeywords)
        ) {
          continue;
        }

        return this.toCommentTriggerOutput(comment);
      }

      return null;
    };
  }

  private matchesKeywordFilters(
    text: string,
    keywords: string[],
    excludeKeywords: string[],
  ): boolean {
    const normalizedText = text.toLowerCase();

    if (
      excludeKeywords.some((keyword) =>
        normalizedText.includes(keyword.toLowerCase()),
      )
    ) {
      return false;
    }

    if (keywords.length === 0) {
      return true;
    }

    return keywords.some((keyword) =>
      normalizedText.includes(keyword.toLowerCase()),
    );
  }

  private toCommentTriggerOutput(
    comment: Awaited<
      ReturnType<YoutubeService['listRecentChannelComments']>
    >['comments'][number],
  ): CommentTriggerOutput {
    return {
      authorId: comment.authorChannelId,
      authorUsername: comment.authorDisplayName,
      commentId: comment.commentId,
      commentedAt: comment.publishedAt,
      contentId: comment.videoId,
      contentUrl: comment.videoUrl,
      platform: 'youtube',
      postId: comment.commentId,
      text: comment.text,
      videoId: comment.videoId,
    };
  }
}
