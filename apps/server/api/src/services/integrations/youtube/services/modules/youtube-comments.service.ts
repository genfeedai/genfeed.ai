import {
  asYoutubeRequestAuth,
  type YoutubeRequestAuth,
} from '@api/services/integrations/youtube/services/modules/youtube-api-auth.util';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { google, type youtube_v3 } from 'googleapis';

@Injectable()
export class YoutubeCommentsService {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: youtube_v3.Youtube;

  constructor(
    private readonly authService: YoutubeAuthService,
    private readonly loggerService: LoggerService,
  ) {
    this.youtubeAPI = google.youtube({ version: 'v3' });
  }

  private async getAuthenticatedChannelContext(
    organizationId: string,
    brandId: string,
  ): Promise<{
    auth: YoutubeRequestAuth;
    channelId: string;
  }> {
    const auth = asYoutubeRequestAuth(
      await this.authService.refreshToken(organizationId, brandId),
    );

    const channelResponse = await this.youtubeAPI.channels.list({
      auth,
      mine: true,
      part: ['id'],
    });

    const channelId = channelResponse.data.items?.[0]?.id;

    if (!channelId) {
      throw new Error('Could not retrieve channel ID for authenticated user');
    }

    return { auth, channelId };
  }

  /**
   * List recent top-level comments across the authenticated channel.
   */
  async listRecentChannelComments(
    organizationId: string,
    brandId: string,
    options: {
      maxResults?: number;
      pageToken?: string;
    } = {},
  ): Promise<{
    comments: YoutubeChannelComment[];
    nextPageToken?: string;
  }> {
    const url = `${this.constructorName} listRecentChannelComments`;

    try {
      const { auth, channelId } = await this.getAuthenticatedChannelContext(
        organizationId,
        brandId,
      );

      const response = await this.youtubeAPI.commentThreads.list({
        allThreadsRelatedToChannelId: channelId,
        auth,
        maxResults: Math.min(Math.max(options.maxResults ?? 25, 1), 100),
        order: 'time',
        pageToken: options.pageToken,
        part: ['snippet'],
        textFormat: 'plainText',
      });

      const comments = (response.data.items ?? []).flatMap((thread) => {
        const threadSnippet = thread.snippet;
        const topLevelComment = threadSnippet?.topLevelComment;
        const commentSnippet = topLevelComment?.snippet;
        const commentId = topLevelComment?.id;
        const videoId = threadSnippet?.videoId;

        if (!commentId || !videoId || !commentSnippet?.textDisplay) {
          return [];
        }

        return [
          {
            authorChannelId: commentSnippet.authorChannelId?.value ?? undefined,
            authorDisplayName: commentSnippet.authorDisplayName ?? undefined,
            authorProfileImageUrl:
              commentSnippet.authorProfileImageUrl ?? undefined,
            commentId,
            likeCount: commentSnippet.likeCount ?? 0,
            publishedAt: commentSnippet.publishedAt ?? undefined,
            text: commentSnippet.textOriginal ?? commentSnippet.textDisplay,
            updatedAt: commentSnippet.updatedAt ?? undefined,
            videoId,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          },
        ];
      });

      this.loggerService.log(`${url} completed`, {
        channelId,
        count: comments.length,
      });

      return {
        comments,
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Post a top-level comment on a YouTube video
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param videoId The YouTube video ID
   * @param text The comment text
   * @returns The comment ID
   */
  async postComment(
    organizationId: string,
    brandId: string,
    videoId: string,
    text: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} postComment`;

    try {
      this.loggerService.log(`${url} started`, {
        textLength: text.length,
        videoId,
      });

      const { auth, channelId } = await this.getAuthenticatedChannelContext(
        organizationId,
        brandId,
      );

      // Post the comment using commentThreads.insert
      const response = await this.youtubeAPI.commentThreads.insert({
        auth,
        part: ['snippet'],
        requestBody: {
          snippet: {
            channelId,
            topLevelComment: {
              snippet: {
                textOriginal: text,
              },
            },
            videoId,
          },
        },
      });

      const commentId = response.data.id;

      if (!commentId) {
        throw new Error('Failed to post comment - no comment ID returned');
      }

      this.loggerService.log(`${url} completed`, { commentId, videoId });

      return { commentId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Reply to an existing top-level YouTube comment.
   */
  async replyToComment(
    organizationId: string,
    brandId: string,
    parentCommentId: string,
    text: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} replyToComment`;

    try {
      this.loggerService.log(`${url} started`, {
        parentCommentId,
        textLength: text.length,
      });

      const auth = asYoutubeRequestAuth(
        await this.authService.refreshToken(organizationId, brandId),
      );

      const response = await this.youtubeAPI.comments.insert({
        auth,
        part: ['snippet'],
        requestBody: {
          snippet: {
            parentId: parentCommentId,
            textOriginal: text,
          },
        },
      });

      const commentId = response.data.id;

      if (!commentId) {
        throw new Error('Failed to reply to comment - no comment ID returned');
      }

      this.loggerService.log(`${url} completed`, {
        commentId,
        parentCommentId,
      });

      return { commentId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async listVideoComments(
    organizationId: string,
    brandId: string,
    videoId: string,
    maxResults = 25,
  ): Promise<
    Array<{
      authorAvatarUrl?: string;
      authorChannelId?: string;
      authorChannelUrl?: string;
      authorDisplayName?: string;
      commentId: string;
      createdAt: Date;
      text: string;
      threadId: string;
    }>
  > {
    const url = `${this.constructorName} listVideoComments`;

    try {
      const auth = asYoutubeRequestAuth(
        await this.authService.refreshToken(organizationId, brandId),
      );
      const response = await this.youtubeAPI.commentThreads.list({
        auth,
        maxResults: Math.min(Math.max(maxResults, 1), 100),
        order: 'time',
        part: ['id', 'snippet'],
        textFormat: 'plainText',
        videoId,
      });

      return (response.data.items ?? []).flatMap((item) => {
        const comment = item.snippet?.topLevelComment;
        const snippet = comment?.snippet;
        const commentId = comment?.id;
        const threadId = item.id;
        const text = snippet?.textOriginal ?? snippet?.textDisplay;

        if (!commentId || !threadId || !text) {
          return [];
        }

        const authorChannelId =
          typeof snippet?.authorChannelId === 'object' &&
          snippet.authorChannelId
            ? (snippet.authorChannelId.value ?? undefined)
            : undefined;

        return [
          {
            authorAvatarUrl: snippet?.authorProfileImageUrl ?? undefined,
            authorChannelId,
            authorChannelUrl: snippet?.authorChannelUrl ?? undefined,
            authorDisplayName: snippet?.authorDisplayName ?? undefined,
            commentId,
            createdAt: snippet?.publishedAt
              ? new Date(snippet.publishedAt)
              : new Date(),
            text,
            threadId,
          },
        ];
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Post a top-level comment on a YouTube video
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param videoId The YouTube video ID
   * @param text The comment text
   * @returns The comment ID
   */

  async postCommentReply(
    organizationId: string,
    brandId: string,
    parentCommentId: string,
    text: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} postCommentReply`;

    try {
      this.loggerService.log(`${url} started`, {
        parentCommentId,
        textLength: text.length,
      });

      const auth = asYoutubeRequestAuth(
        await this.authService.refreshToken(organizationId, brandId),
      );
      const response = await this.youtubeAPI.comments.insert({
        auth,
        part: ['snippet'],
        requestBody: {
          snippet: {
            parentId: parentCommentId,
            textOriginal: text,
          },
        },
      });

      const commentId = response.data.id;
      if (!commentId) {
        throw new Error(
          'Failed to post comment reply - no comment ID returned',
        );
      }

      this.loggerService.log(`${url} completed`, {
        commentId,
        parentCommentId,
      });

      return { commentId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}

export interface YoutubeChannelComment {
  commentId: string;
  videoId: string;
  videoUrl: string;
  text: string;
  authorChannelId?: string;
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
  likeCount: number;
  publishedAt?: string;
  updatedAt?: string;
}
