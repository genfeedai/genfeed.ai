import type {
  ApifyHashtagData,
  ApifyInstagramPost,
  ApifyNormalizedInstagramComment,
  ApifyNormalizedSocialComment,
  ApifyNormalizedTikTokComment,
  ApifyNormalizedTweet,
  ApifyNormalizedYouTubeComment,
  ApifyRedditPost,
  ApifySoundData,
  ApifyTikTokVideo,
  ApifyTrendData,
  ApifyVideoData,
  ApifyYouTubeVideo,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyPinterestService } from '@api/services/integrations/apify/services/modules/apify-pinterest.service';
import { ApifyRedditService } from '@api/services/integrations/apify/services/modules/apify-reddit.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyService
 *
 * Orchestrator that delegates to platform-specific sub-services.
 * Public methods follow the existing integration service contract.
 *
 * Sub-services:
 * - ApifyBaseService: Shared actor execution, metrics, helpers
 * - ApifyTikTokService: TikTok trends, videos, sounds, comments
 * - ApifyInstagramService: Instagram trends, videos, comments
 * - ApifyTwitterService: Twitter/X trends, mentions, timeline, search
 * - ApifyYouTubeService: YouTube trends, videos, comments
 * - ApifyRedditService: Reddit trends, videos, comments, posts
 * - ApifyPinterestService: Pinterest trends
 */
@Injectable()
export class ApifyService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly tiktokService: ApifyTikTokService,
    private readonly instagramService: ApifyInstagramService,
    private readonly twitterService: ApifyTwitterService,
    private readonly youtubeService: ApifyYouTubeService,
    private readonly redditService: ApifyRedditService,
    private readonly pinterestService: ApifyPinterestService,
    private readonly loggerService: LoggerService,
  ) {}

  // ==================== Base (delegated to ApifyBaseService) ====================

  /**
   * Run an Apify actor and wait for results
   */
  runActor<T>(actorId: string, input: object): Promise<T[]> {
    return this.baseService.runActor<T>(actorId, input);
  }

  // ==================== TikTok ====================

  getTikTokTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.tiktokService.getTikTokTrends(options);
  }

  getTikTokVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.tiktokService.getTikTokVideos(limit);
  }

  getTikTokSounds(limit: number = 50): Promise<ApifySoundData[]> {
    return this.tiktokService.getTikTokSounds(limit);
  }

  getTikTokVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedTikTokComment[]> {
    return this.tiktokService.getTikTokVideoComments(videoUrl, options);
  }

  getTikTokUserVideos(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyTikTokVideo[]> {
    return this.tiktokService.getTikTokUserVideos(username, options);
  }

  searchTikTokByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyTikTokVideo[]> {
    return this.tiktokService.searchTikTokByHashtag(hashtag, options);
  }

  // ==================== Instagram ====================

  getInstagramTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.instagramService.getInstagramTrends(options);
  }

  getInstagramVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.instagramService.getInstagramVideos(limit);
  }

  getInstagramPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedInstagramComment[]> {
    return this.instagramService.getInstagramPostComments(postUrl, options);
  }

  getInstagramUserPosts(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    return this.instagramService.getInstagramUserPosts(username, options);
  }

  searchInstagramByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    return this.instagramService.searchInstagramByHashtag(hashtag, options);
  }

  // ==================== Twitter/X ====================

  getTwitterTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.twitterService.getTwitterTrends(options);
  }

  getTwitterMentions(
    username: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    return this.twitterService.getTwitterMentions(username, options);
  }

  getTwitterUserTimeline(
    username: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    return this.twitterService.getTwitterUserTimeline(username, options);
  }

  getTwitterTweetReplies(
    tweetId: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedTweet[]> {
    return this.twitterService.getTwitterTweetReplies(tweetId, options);
  }

  searchTwitterTweets(
    query: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    return this.twitterService.searchTwitterTweets(query, options);
  }

  // ==================== YouTube ====================

  getYouTubeTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.youtubeService.getYouTubeTrends(options);
  }

  getYouTubeVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.youtubeService.getYouTubeVideos(limit);
  }

  getYouTubeVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedYouTubeComment[]> {
    return this.youtubeService.getYouTubeVideoComments(videoUrl, options);
  }

  getYouTubeChannelVideos(
    channelUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    return this.youtubeService.getYouTubeChannelVideos(channelUrl, options);
  }

  searchYouTubeVideos(
    query: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    return this.youtubeService.searchYouTubeVideos(query, options);
  }

  // ==================== Reddit ====================

  getRedditTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.redditService.getRedditTrends(options);
  }

  getRedditVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.redditService.getRedditVideos(limit);
  }

  getRedditPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getRedditPostComments(postUrl, options);
  }

  getSubredditPosts(
    subreddit: string,
    options?: { limit?: number; sort?: 'hot' | 'new' | 'top' },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getSubredditPosts(subreddit, options);
  }

  getRedditUserPosts(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getRedditUserPosts(username, options);
  }

  searchRedditPosts(
    query: string,
    options?: { limit?: number; subreddit?: string },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.searchRedditPosts(query, options);
  }

  // ==================== Pinterest ====================

  getPinterestTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.pinterestService.getPinterestTrends(options);
  }

  // ==================== Hashtags (Multi-Platform) ====================

  /**
   * Get trending hashtags from a specific platform
   */
  async getTrendingHashtags(
    platform: string,
    limit: number = 50,
  ): Promise<ApifyHashtagData[]> {
    const trendFetchers: Record<
      string,
      (options: TrendOptions) => Promise<ApifyTrendData[]>
    > = {
      instagram: (options) => this.getInstagramTrends(options),
      tiktok: (options) => this.getTikTokTrends(options),
      twitter: (options) => this.getTwitterTrends(options),
    };

    const fetcher = trendFetchers[platform];
    if (!fetcher) {
      return [];
    }

    try {
      const trends = await fetcher({ limit });

      return trends
        .filter((t) => t.metadata.trendType === 'hashtag')
        .map((t) => ({
          growthRate: t.growthRate,
          hashtag: t.topic.replace(/^#/, ''),
          platform: t.platform,
          postCount: t.mentions,
          relatedHashtags: (t.metadata.hashtags as string[]) || [],
          viewCount: (t.metadata.viewCount as number) || 0,
          viralityScore: t.viralityScore,
        }));
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.getTrendingHashtags failed for ${platform}`,
        error,
      );
      return [];
    }
  }

  // ==================== Unified Social Comment Interface ====================

  /**
   * Convert any platform's normalized comment to unified format
   * Enables platform-agnostic processing in reply bot
   */
  convertToUnifiedComment(
    comment:
      | ApifyNormalizedTweet
      | ApifyNormalizedInstagramComment
      | ApifyNormalizedTikTokComment
      | ApifyNormalizedYouTubeComment,
    platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube',
  ): ApifyNormalizedSocialComment {
    if (platform === 'twitter') {
      const tweet = comment as ApifyNormalizedTweet;
      return {
        authorAvatarUrl: tweet.authorAvatarUrl,
        authorDisplayName: tweet.authorDisplayName,
        authorId: tweet.authorId,
        authorUsername: tweet.authorUsername,
        contentId: tweet.conversationId || tweet.id,
        contentType: 'tweet',
        contentUrl: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
        createdAt: tweet.createdAt,
        hashtags: tweet.hashtags,
        id: tweet.id,
        inReplyToId: tweet.inReplyToTweetId,
        metrics: tweet.metrics
          ? { likes: tweet.metrics.likes, replies: tweet.metrics.replies }
          : undefined,
        platform: 'twitter',
        text: tweet.text,
      };
    }

    if (platform === 'instagram') {
      const igComment = comment as ApifyNormalizedInstagramComment;
      return {
        authorAvatarUrl: igComment.authorAvatarUrl,
        authorId: igComment.authorId,
        authorUsername: igComment.authorUsername,
        contentId: igComment.postId,
        contentType: 'post',
        contentUrl: igComment.postShortCode
          ? `https://instagram.com/p/${igComment.postShortCode}`
          : undefined,
        createdAt: igComment.createdAt,
        id: igComment.id,
        metrics: igComment.metrics,
        platform: 'instagram',
        text: igComment.text,
      };
    }

    if (platform === 'tiktok') {
      const ttComment = comment as ApifyNormalizedTikTokComment;
      return {
        authorAvatarUrl: ttComment.authorAvatarUrl,
        authorDisplayName: ttComment.authorDisplayName,
        authorId: ttComment.authorId,
        authorUsername: ttComment.authorUsername,
        contentId: ttComment.videoId,
        contentType: 'video',
        createdAt: ttComment.createdAt,
        id: ttComment.id,
        metrics: ttComment.metrics,
        platform: 'tiktok',
        text: ttComment.text,
      };
    }

    // YouTube
    const ytComment = comment as ApifyNormalizedYouTubeComment;
    return {
      authorAvatarUrl: ytComment.authorAvatarUrl,
      authorDisplayName: ytComment.authorDisplayName,
      authorId: ytComment.authorId,
      authorUsername: ytComment.authorId,
      contentId: ytComment.videoId,
      contentType: 'video',
      contentUrl: `https://youtube.com/watch?v=${ytComment.videoId}`,
      createdAt: ytComment.createdAt,
      id: ytComment.id,
      metrics: ytComment.metrics,
      platform: 'youtube',
      text: ytComment.text,
    };
  }
}
