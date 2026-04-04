import type {
  ApifyInstagramComment,
  ApifyInstagramHashtag,
  ApifyInstagramPost,
  ApifyNormalizedInstagramComment,
  ApifyTrendData,
  ApifyVideoData,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyInstagramService
 *
 * Handles all Instagram-related Apify scraping operations:
 * trends, videos, comments, user posts, and hashtag search.
 */
@Injectable()
export class ApifyInstagramService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly TREND_SEED_HASHTAGS = [
    'viral',
    'reels',
    'trending',
    'explorepage',
  ] as const;

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get Instagram trending hashtags
   */
  async getInstagramTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const requestedLimit = Math.max(1, options?.limit || 5);
      const seedCount = this.getTrendSeedCount(requestedLimit);
      const seedHashtags = this.TREND_SEED_HASHTAGS.slice(0, seedCount);

      const input = {
        hashtags: seedHashtags,
        // Apify treats this as a per-hashtag limit, so distribute the
        // caller's requested total budget across the few highest-signal seeds.
        resultsLimit: Math.max(
          1,
          Math.ceil(requestedLimit / seedHashtags.length),
        ),
      };

      const rawData = await this.baseService.runActor<ApifyInstagramHashtag>(
        this.baseService.ACTORS.INSTAGRAM_HASHTAG,
        input,
      );

      return this.normalizeInstagramTrends(rawData)
        .sort((left, right) => right.mentions - left.mentions)
        .slice(0, requestedLimit);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramTrends failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get Instagram trending posts/reels
   */
  async getInstagramVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    try {
      const input = {
        hashtags: ['reels', 'viral', 'trending'],
        resultsLimit: limit,
        resultsType: 'posts',
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_SCRAPER,
        input,
      );

      return this.normalizeInstagramVideos(rawPosts);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramVideos failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get comments on an Instagram post
   * Used to find comments to reply to
   */
  async getInstagramPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedInstagramComment[]> {
    try {
      const input = {
        directUrls: [postUrl],
        resultsLimit: options?.limit || 50,
      };

      const rawComments =
        await this.baseService.runActor<ApifyInstagramComment>(
          this.baseService.ACTORS.INSTAGRAM_COMMENT_SCRAPER,
          input,
        );

      return this.normalizeInstagramComments(rawComments);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramPostComments failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent posts from an Instagram user
   * Used to monitor accounts
   */
  async getInstagramUserPosts(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    try {
      const input = {
        resultsLimit: options?.limit || 20,
        usernames: [username],
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_SCRAPER,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramUserPosts failed for @${username}`,
        error,
      );
      return [];
    }
  }

  /**
   * Search Instagram posts by hashtag
   */
  async searchInstagramByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    try {
      const input = {
        hashtags: [hashtag.replace(/^#/, '')],
        resultsLimit: options?.limit || 50,
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_HASHTAG,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchInstagramByHashtag failed for #${hashtag}`,
        error,
      );
      return [];
    }
  }

  private normalizeInstagramTrends(
    hashtags: ApifyInstagramHashtag[],
  ): ApifyTrendData[] {
    return hashtags.map((hashtag) => ({
      growthRate: this.baseService.calculateGrowthRate(hashtag.mediaCount || 0),
      mentions: hashtag.mediaCount || 0,
      metadata: {
        hashtags: [hashtag.name],
        postCount: hashtag.mediaCount,
        source: 'apify' as const,
        trendType: 'hashtag' as const,
      },
      platform: 'instagram',
      topic: hashtag.name,
      viralityScore: this.baseService.calculateViralityScore(
        hashtag.mediaCount || 0,
        1,
      ),
    }));
  }

  private normalizeInstagramVideos(
    posts: ApifyInstagramPost[],
  ): ApifyVideoData[] {
    return posts
      .filter((post) => post.videoUrl || post.videoViewCount)
      .map((post) => {
        const viewCount = post.videoViewCount || 0;
        const likeCount = post.likesCount || 0;
        const commentCount = post.commentsCount || 0;
        const publishedAt = post.timestamp
          ? new Date(post.timestamp)
          : undefined;

        const metrics = this.baseService.calculateEngagementMetrics(
          viewCount,
          likeCount,
          commentCount,
          0, // Instagram doesn't expose shares
          publishedAt,
        );

        return {
          commentCount,
          creatorHandle: post.ownerUsername || 'unknown',
          description: post.caption,
          engagementRate: metrics.engagementRate,
          externalId: post.id,
          hashtags: post.hashtags || [],
          likeCount,
          platform: 'instagram',
          publishedAt,
          shareCount: 0,
          thumbnailUrl: post.imageUrl,
          title: post.caption?.substring(0, 100),
          velocity: metrics.velocity,
          videoUrl: post.videoUrl,
          viewCount,
          viralScore: metrics.viralScore,
        };
      });
  }

  private normalizeInstagramComments(
    comments: ApifyInstagramComment[],
  ): ApifyNormalizedInstagramComment[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.ownerProfilePicUrl,
      authorId: comment.ownerId || '',
      authorUsername: comment.ownerUsername || '',
      createdAt: comment.timestamp ? new Date(comment.timestamp) : new Date(),
      id: comment.id,
      metrics: {
        likes: comment.likesCount || 0,
        replies: comment.repliesCount || 0,
      },
      postId: comment.postId || '',
      postShortCode: comment.postShortCode,
      text: comment.text,
    }));
  }

  private getTrendSeedCount(limit: number): number {
    if (limit <= 6) {
      return 2;
    }

    if (limit <= 12) {
      return 3;
    }

    return this.TREND_SEED_HASHTAGS.length;
  }
}
