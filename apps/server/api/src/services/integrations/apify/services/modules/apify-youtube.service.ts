import type {
  ApifyNormalizedYouTubeComment,
  ApifyTrendData,
  ApifyVideoData,
  ApifyYouTubeComment,
  ApifyYouTubeVideo,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyYouTubeService
 *
 * Handles all YouTube-related Apify scraping operations:
 * trends, videos, comments, channel videos, and search.
 */
@Injectable()
export class ApifyYouTubeService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get YouTube trending videos
   */
  async getYouTubeTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const videos = await this.getYouTubeVideos(options?.limit || 20);

      // Convert videos to trend format
      return videos.map((video) => ({
        growthRate: Math.min(100, video.velocity / 100),
        mentions: video.viewCount,
        metadata: {
          creatorHandle: video.creatorHandle,
          hashtags: video.hashtags,
          likeCount: video.likeCount,
          source: 'apify' as const,
          thumbnailUrl: video.thumbnailUrl,
          trendType: 'video' as const,
          videoUrl: video.videoUrl,
          viewCount: video.viewCount,
        },
        platform: 'youtube',
        topic: video.title || 'Trending Video',
        viralityScore: video.viralScore,
      }));
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getYouTubeTrends failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get YouTube trending videos
   */
  async getYouTubeVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    try {
      const input = {
        maxResults: limit,
        publishedAfter: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        sortBy: 'viewCount',
      };

      const rawVideos = await this.baseService.runActor<ApifyYouTubeVideo>(
        this.baseService.ACTORS.YOUTUBE_SCRAPER,
        input,
      );

      return this.normalizeYouTubeVideos(rawVideos);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getYouTubeVideos failed`,
        error,
      );
      return [];
    }
  }

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
      this.baseService.loggerService.error(
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
      this.baseService.loggerService.error(
        `${this.constructorName}.getYouTubeChannelVideos failed`,
        error,
      );
      return [];
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
        searchKeywords: query,
      };

      const rawVideos = await this.baseService.runActor<ApifyYouTubeVideo>(
        this.baseService.ACTORS.YOUTUBE_SCRAPER,
        input,
      );

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchYouTubeVideos failed for "${query}"`,
        error,
      );
      return [];
    }
  }

  private normalizeYouTubeVideos(
    videos: ApifyYouTubeVideo[],
  ): ApifyVideoData[] {
    return videos.map((video) => {
      const viewCount = video.viewCount || 0;
      const likeCount = video.likeCount || 0;
      const commentCount = video.commentCount || 0;
      const publishedAt = video.publishedAt
        ? new Date(video.publishedAt)
        : undefined;

      const metrics = this.baseService.calculateEngagementMetrics(
        viewCount,
        likeCount,
        commentCount,
        0, // YouTube doesn't expose shares
        publishedAt,
      );

      return {
        commentCount,
        creatorHandle: video.channelName || 'unknown',
        creatorId: video.channelId,
        description: video.description,
        duration: this.baseService.parseDuration(video.duration),
        engagementRate: metrics.engagementRate,
        externalId: video.id,
        hashtags: this.baseService.extractHashtags(video.description || ''),
        likeCount,
        platform: 'youtube',
        publishedAt,
        shareCount: 0,
        thumbnailUrl: video.thumbnailUrl,
        title: video.title,
        velocity: metrics.velocity,
        videoUrl: video.url,
        viewCount,
        viralScore: metrics.viralScore,
      };
    });
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
