import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { google, youtube_v3 } from 'googleapis';

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

      const auth = await this.authService.refreshToken(organizationId, brandId);

      // Get channel ID for the authenticated user
      const channelResponse = await this.youtubeAPI.channels.list({
        auth,
        mine: true,
        part: ['id'],
      });

      const channelId = channelResponse.data.items?.[0]?.id;

      if (!channelId) {
        throw new Error('Could not retrieve channel ID for authenticated user');
      }

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
}
