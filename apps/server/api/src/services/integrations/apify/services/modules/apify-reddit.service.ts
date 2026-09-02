import type {
  ApifyRedditPost,
  ApifyTrendData,
  ApifyVideoData,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyRedditService
 *
 * Handles all Reddit-related Apify scraping operations:
 * trends, videos, comments, subreddit posts, user posts, and search.
 */
@Injectable()
export class ApifyRedditService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get Reddit trending posts
   */
  async getRedditTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const input = {
        maxItems: options?.limit || 20,
        sort: 'hot',
        subreddits: ['all', 'popular', 'trending'],
      };

      const rawPosts = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_SCRAPER,
        input,
      );

      return this.normalizeRedditTrends(rawPosts);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getRedditTrends failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get Reddit trending videos/posts
   */
  async getRedditVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    try {
      const input = {
        maxItems: limit,
        sort: 'hot',
        subreddits: ['videos', 'TikTokCringe', 'funny', 'nextfuckinglevel'],
      };

      const rawPosts = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_SCRAPER,
        input,
      );

      return this.normalizeRedditVideos(rawPosts.filter((p) => p.isVideo));
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getRedditVideos failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get comments on a Reddit post
   * Used to find comments to reply to
   */
  async getRedditPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    try {
      const input = {
        maxItems: options?.limit || 50,
        startUrls: [{ url: postUrl }],
        type: 'comments',
      };

      const rawComments = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_COMMENT_SCRAPER,
        input,
      );

      return rawComments;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getRedditPostComments failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent posts from a subreddit
   * Used to monitor subreddits
   */
  async getSubredditPosts(
    subreddit: string,
    options?: { limit?: number; sort?: 'hot' | 'new' | 'top' },
  ): Promise<ApifyRedditPost[]> {
    try {
      const input = {
        maxItems: options?.limit || 20,
        sort: options?.sort || 'new',
        subreddits: [subreddit],
      };

      const rawPosts = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_SCRAPER,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getSubredditPosts failed for r/${subreddit}`,
        error,
      );
      return [];
    }
  }

  /**
   * Get posts from a Reddit user
   */
  async getRedditUserPosts(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    try {
      const input = {
        maxItems: options?.limit || 20,
        startUrls: [{ url: `https://reddit.com/user/${username}` }],
      };

      const rawPosts = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_SCRAPER,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getRedditUserPosts failed for u/${username}`,
        error,
      );
      return [];
    }
  }

  /**
   * Search Reddit posts
   */
  async searchRedditPosts(
    query: string,
    options?: { limit?: number; subreddit?: string },
  ): Promise<ApifyRedditPost[]> {
    try {
      const searchUrl = options?.subreddit
        ? `https://reddit.com/r/${options.subreddit}/search?q=${encodeURIComponent(query)}`
        : `https://reddit.com/search?q=${encodeURIComponent(query)}`;

      const input = {
        maxItems: options?.limit || 50,
        startUrls: [{ url: searchUrl }],
      };

      const rawPosts = await this.baseService.runActor<ApifyRedditPost>(
        this.baseService.ACTORS.REDDIT_SCRAPER,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchRedditPosts failed for "${query}"`,
        error,
      );
      return [];
    }
  }

  private normalizeRedditTrends(posts: ApifyRedditPost[]): ApifyTrendData[] {
    return posts.map((post) => ({
      growthRate: (post.upvoteRatio || 0.5) * 100,
      mentions: post.score || 0,
      metadata: {
        commentCount: post.numComments,
        hashtags: [],
        sampleContent: post.title,
        source: 'apify' as const,
        subreddit: post.subreddit,
        trendType: 'topic' as const,
        upvoteRatio: post.upvoteRatio,
        urls: post.url ? [post.url] : [],
      },
      platform: 'reddit',
      topic: post.title || 'Trending Post',
      viralityScore: this.baseService.calculateViralityScore(
        post.score || 0,
        post.numComments || 0,
      ),
    }));
  }

  private normalizeRedditVideos(posts: ApifyRedditPost[]): ApifyVideoData[] {
    return posts.map((post) => {
      const score = post.score || 0;
      const commentCount = post.numComments || 0;
      const publishedAt = post.createdUtc
        ? new Date(post.createdUtc * 1000)
        : undefined;

      // Reddit uses score (upvotes - downvotes) as the primary metric
      const metrics = this.baseService.calculateEngagementMetrics(
        score, // Use score as viewCount equivalent
        score, // Likes are represented by score
        commentCount,
        0,
        publishedAt,
      );

      return {
        commentCount,
        creatorHandle: post.author || 'unknown',
        engagementRate: metrics.engagementRate,
        externalId: post.id,
        hashtags: [],
        likeCount: score,
        platform: 'reddit',
        publishedAt,
        shareCount: 0,
        title: post.title,
        velocity: metrics.velocity,
        videoUrl: post.url,
        viewCount: score,
        viralScore: metrics.viralScore,
      };
    });
  }
}
