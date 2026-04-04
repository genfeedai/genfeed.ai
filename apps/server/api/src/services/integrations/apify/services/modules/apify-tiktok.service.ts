import type {
  ApifyNormalizedTikTokComment,
  ApifySoundData,
  ApifyTikTokComment,
  ApifyTikTokTrend,
  ApifyTikTokVideo,
  ApifyTrendData,
  ApifyVideoData,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyTikTokService
 *
 * Handles all TikTok-related Apify scraping operations:
 * trends, videos, sounds, comments, user videos, and hashtag search.
 */
@Injectable()
export class ApifyTikTokService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get TikTok trending topics/hashtags
   */
  async getTikTokTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const input = {
        maxItems: options?.limit || 20,
        region: options?.region || 'US',
      };

      const rawTrends = await this.baseService.runActor<ApifyTikTokTrend>(
        this.baseService.ACTORS.TIKTOK_TRENDS,
        input,
      );

      return this.normalizeTikTokTrends(rawTrends);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTikTokTrends failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get TikTok trending videos
   */
  async getTikTokVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    try {
      const input = {
        hashtags: ['trending', 'fyp', 'viral'],
        maxItems: limit,
        sortBy: 'views',
      };

      const rawVideos = await this.baseService.runActor<ApifyTikTokVideo>(
        this.baseService.ACTORS.TIKTOK_SCRAPER,
        input,
      );

      return this.normalizeTikTokVideos(rawVideos);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTikTokVideos failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get TikTok trending sounds
   */
  async getTikTokSounds(limit: number = 50): Promise<ApifySoundData[]> {
    try {
      // TikTok sounds are extracted from trending videos
      const videos = await this.getTikTokVideos(limit * 2);

      // Extract unique sounds
      const soundMap = new Map<string, ApifySoundData>();

      for (const video of videos) {
        if (video.soundId && !soundMap.has(video.soundId)) {
          soundMap.set(video.soundId, {
            growthRate: 0,
            platform: 'tiktok',
            soundId: video.soundId,
            soundName: video.soundName || 'Unknown',
            usageCount: 1,
            viralityScore: Math.min(100, video.viralScore),
          });
        } else if (video.soundId) {
          const existing = soundMap.get(video.soundId)!;
          existing.usageCount += 1;
        }
      }

      return Array.from(soundMap.values())
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, limit);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTikTokSounds failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get comments on a TikTok video
   * Used to find comments to reply to
   */
  async getTikTokVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedTikTokComment[]> {
    try {
      const input = {
        maxComments: options?.limit || 50,
        postURLs: [videoUrl],
      };

      const rawComments = await this.baseService.runActor<ApifyTikTokComment>(
        this.baseService.ACTORS.TIKTOK_COMMENT_SCRAPER,
        input,
      );

      return this.normalizeTikTokComments(rawComments);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTikTokVideoComments failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent videos from a TikTok user
   * Used to monitor accounts
   */
  async getTikTokUserVideos(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyTikTokVideo[]> {
    try {
      const input = {
        profiles: [username],
        resultsPerPage: options?.limit || 20,
      };

      const rawVideos = await this.baseService.runActor<ApifyTikTokVideo>(
        this.baseService.ACTORS.TIKTOK_SCRAPER,
        input,
      );

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTikTokUserVideos failed for @${username}`,
        error,
      );
      return [];
    }
  }

  /**
   * Search TikTok videos by hashtag
   */
  async searchTikTokByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyTikTokVideo[]> {
    try {
      const input = {
        hashtags: [hashtag.replace(/^#/, '')],
        resultsPerPage: options?.limit || 50,
      };

      const rawVideos = await this.baseService.runActor<ApifyTikTokVideo>(
        this.baseService.ACTORS.TIKTOK_SCRAPER,
        input,
      );

      return rawVideos;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchTikTokByHashtag failed for #${hashtag}`,
        error,
      );
      return [];
    }
  }

  private normalizeTikTokTrends(trends: ApifyTikTokTrend[]): ApifyTrendData[] {
    return trends.map((trend) => ({
      growthRate: this.baseService.calculateGrowthRate(trend.videoCount || 0),
      mentions: trend.videoCount || 0,
      metadata: {
        hashtags: trend.hashtag ? [trend.hashtag] : [],
        source: 'apify' as const,
        thumbnailUrl: trend.coverUrl,
        trendType: 'hashtag' as const,
        videoCount: trend.videoCount,
        viewCount: trend.viewCount,
      },
      platform: 'tiktok',
      topic: trend.hashtag || trend.title || 'Unknown',
      viralityScore: this.baseService.calculateViralityScore(
        trend.viewCount || 0,
        trend.videoCount || 0,
      ),
    }));
  }

  private normalizeTikTokVideos(videos: ApifyTikTokVideo[]): ApifyVideoData[] {
    return videos.map((video) => {
      const viewCount = video.playCount || 0;
      const likeCount = video.diggCount || 0;
      const commentCount = video.commentCount || 0;
      const shareCount = video.shareCount || 0;
      const publishedAt = video.createTime
        ? new Date(video.createTime * 1000)
        : undefined;

      const metrics = this.baseService.calculateEngagementMetrics(
        viewCount,
        likeCount,
        commentCount,
        shareCount,
        publishedAt,
      );

      return {
        commentCount,
        creatorHandle:
          video.authorMeta?.name || video.authorMeta?.nickname || 'unknown',
        creatorId: video.authorMeta?.id,
        description: video.desc,
        duration: video.videoMeta?.duration,
        engagementRate: metrics.engagementRate,
        externalId: video.id,
        hashtags:
          video.hashtags?.map((h: { name?: string }) => h.name || '') || [],
        hook: video.desc?.substring(0, 50),
        likeCount,
        platform: 'tiktok',
        publishedAt,
        shareCount,
        soundId: video.musicMeta?.musicId,
        soundName: video.musicMeta?.musicName,
        thumbnailUrl: undefined,
        title: video.desc?.substring(0, 100),
        velocity: metrics.velocity,
        videoUrl: video.webVideoUrl,
        viewCount,
        viralScore: metrics.viralScore,
      };
    });
  }

  private normalizeTikTokComments(
    comments: ApifyTikTokComment[],
  ): ApifyNormalizedTikTokComment[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.user?.avatarThumb,
      authorDisplayName: comment.user?.nickname,
      authorId: comment.user?.id || '',
      authorUsername: comment.user?.uniqueId || '',
      createdAt: comment.createTime
        ? new Date(comment.createTime * 1000)
        : new Date(),
      id: comment.id || comment.cid || '',
      isVerified: comment.user?.verified,
      metrics: {
        likes: comment.diggCount || 0,
        replies: comment.replyCommentTotal || 0,
      },
      text: comment.text,
      videoId: comment.videoId || '',
    }));
  }
}
