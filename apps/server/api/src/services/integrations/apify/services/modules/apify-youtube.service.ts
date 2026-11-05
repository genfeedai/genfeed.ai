import type {
  ApifyNormalizedYouTubeComment,
  ApifyYouTubeComment,
  ApifyYouTubeVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import type { SocialSourceResearchContext } from '@api/services/source-collector/source-collector.types';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * ApifyYouTubeService
 *
 * Handles all YouTube-related Apify scraping operations:
 * comments, channel videos, and search.
 */
@Traced()
@Injectable()
export class ApifyYouTubeService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly runner: ResearchCollectionRunner,
  ) {}

  /**
   * Get comments on a YouTube video
   * Used to find comments to reply to
   */
  async getYouTubeVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedYouTubeComment[]> {
    try {
      const input = {
        maxComments: options?.limit || 50,
        startUrls: [{ url: videoUrl }],
      };

      const rawComments = await this.baseService.runActor<ApifyYouTubeComment>(
        this.baseService.ACTORS.YOUTUBE_COMMENT_SCRAPER,
        input,
      );

      return this.normalizeYouTubeComments(rawComments);
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.getYouTubeVideoComments failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent videos from a YouTube channel
   * Used to monitor accounts
   */
  async getYouTubeChannelVideos(
    channelUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    try {
      const input = {
        maxResults: options?.limit || 20,
        startUrls: [{ url: channelUrl }],
      };

      const rawVideos = await this.baseService.runActor<ApifyYouTubeVideo>(
        this.baseService.ACTORS.YOUTUBE_CHANNEL_SCRAPER,
        input,
      );

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.getYouTubeChannelVideos failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent uploads from a public YouTube channel for Following/social
   * source collection. Hard-fails when Apify is not configured so sync
   * cannot look "successful" with zero posts after a silent skip — unlike
   * {@link getYouTubeChannelVideos}, which stays lenient for account
   * monitoring callers that already tolerate an empty result.
   */
  async getYouTubeChannelUploads(
    channelUrl: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyYouTubeVideo[]> {
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape YouTube channels',
      );
    }

    try {
      const input = {
        maxResults: options?.limit || 20,
        startUrls: [{ url: channelUrl }],
      };

      const rawVideos = await (researchContext
        ? this.runner.run<ApifyYouTubeVideo>(
            researchContext.organizationId,
            this.baseService.ACTORS.YOUTUBE_CHANNEL_SCRAPER,
            input,
            { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
          )
        : this.baseService.runActor<ApifyYouTubeVideo>(
            this.baseService.ACTORS.YOUTUBE_CHANNEL_SCRAPER,
            input,
          ));

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.getYouTubeChannelUploads failed for ${channelUrl}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Search YouTube videos
   */
  async searchYouTubeVideos(
    query: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    try {
      const input = {
        maxResults: options?.limit || 50,
        searchQueries: [query],
      };

      const rawVideos = await this.baseService.runActor<ApifyYouTubeVideo>(
        this.baseService.ACTORS.YOUTUBE_SCRAPER,
        input,
      );

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.searchYouTubeVideos failed for "${query}"`,
        error,
      );
      return [];
    }
  }

  private normalizeYouTubeComments(
    comments: ApifyYouTubeComment[],
  ): ApifyNormalizedYouTubeComment[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.authorProfileImageUrl,
      authorDisplayName: comment.authorDisplayName || '',
      authorId: comment.authorChannelId || '',
      createdAt: comment.publishedAt
        ? new Date(comment.publishedAt)
        : new Date(),
      id: comment.id || comment.commentId || '',
      metrics: {
        likes: comment.likeCount || 0,
        replies: comment.replyCount || 0,
      },
      text: comment.text,
      videoId: comment.videoId || '',
      videoTitle: comment.videoTitle,
    }));
  }
}
