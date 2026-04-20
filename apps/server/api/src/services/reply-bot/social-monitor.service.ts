/**
 * Social Monitor Service
 *
 * Unified service for monitoring social media content across multiple platforms.
 * Abstracts platform-specific differences and provides a single interface for:
 * - Fetching comments/replies on user's content
 * - Fetching user timelines across platforms
 * - Searching content by hashtag/query
 * - Normalizing data to platform-agnostic format
 *
 * Supported platforms: Twitter/X, Instagram, TikTok, YouTube, Reddit
 */
import type { MonitoredAccountFilters } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ConfigService } from '@api/config/config.service';
import type {
  ApifyInstagramPost,
  ApifyNormalizedInstagramComment,
  ApifyNormalizedTikTokComment,
  ApifyNormalizedTweet,
  ApifyNormalizedYouTubeComment,
  ApifyRedditPost,
  ApifyTikTokVideo,
  ApifyYouTubeVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import {
  ReplyBotPlatform,
  ReplyBotType,
  SocialContentType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Unified social content data structure
 * Platform-agnostic representation of content to monitor
 */
export interface SocialContentData {
  id: string;
  platform: ReplyBotPlatform;
  contentType: SocialContentType;
  text: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorFollowersCount?: number;
  createdAt: Date;
  contentUrl?: string;
  parentContentId?: string;
  inReplyToId?: string;
  metrics?: {
    likes: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
  hashtags?: string[];
  isRepost?: boolean;
}

/**
 * Options for fetching social content
 */
export interface FetchContentOptions {
  limit?: number;
  sinceId?: string;
  includeReplies?: boolean;
}

@Injectable()
export class SocialMonitorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly apifyService: ApifyService,
  ) {}

  /**
   * Execute a platform-specific handler with consistent logging and error handling
   */
  private async executePlatformHandler<T>(
    platform: ReplyBotPlatform,
    handlers: Partial<Record<ReplyBotPlatform, () => Promise<T>>>,
    context: { method: string; logData: Record<string, unknown> },
  ): Promise<T> {
    const url = `${this.constructorName} ${context.method}`;
    const handler = handlers[platform];

    if (!handler) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    try {
      const result = await handler();
      this.loggerService.log(`${url} success`, {
        ...context.logData,
        platform,
      });
      return result;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, { error, platform });
      throw error;
    }
  }

  /**
   * Get comments/replies on user's content
   * This is used for REPLY_GUY and COMMENT_RESPONDER bot types
   */
  async getContentComments(
    platform: ReplyBotPlatform,
    contentIdentifier: string,
    options: FetchContentOptions = {},
  ): Promise<SocialContentData[]> {
    const limit = options.limit || 50;

    const comments = await this.executePlatformHandler(
      platform,
      {
        [ReplyBotPlatform.TWITTER]: () =>
          this.getTwitterReplies(contentIdentifier, limit),
        [ReplyBotPlatform.INSTAGRAM]: () =>
          this.getInstagramComments(contentIdentifier, limit),
        [ReplyBotPlatform.TIKTOK]: () =>
          this.getTikTokComments(contentIdentifier, limit),
        [ReplyBotPlatform.YOUTUBE]: () =>
          this.getYouTubeComments(contentIdentifier, limit),
        [ReplyBotPlatform.REDDIT]: () =>
          this.getRedditComments(contentIdentifier, limit),
      },
      {
        logData: { commentCount: 0, contentIdentifier },
        method: 'getContentComments',
      },
    );

    return comments;
  }

  /**
   * Get mentions/tags of the user across platform
   * This is used for REPLY_GUY bot type
   */
  getUserMentions(
    platform: ReplyBotPlatform,
    username: string,
    options: FetchContentOptions = {},
  ): Promise<SocialContentData[]> {
    const limit = options.limit || 50;

    return this.executePlatformHandler(
      platform,
      {
        [ReplyBotPlatform.TWITTER]: () =>
          this.getTwitterMentions(username, limit, options.sinceId),
        [ReplyBotPlatform.INSTAGRAM]: () =>
          this.getInstagramMentions(username, limit),
        [ReplyBotPlatform.TIKTOK]: () =>
          this.getTikTokMentions(username, limit),
        [ReplyBotPlatform.YOUTUBE]: async () => [], // YouTube doesn't have a traditional mention system
        [ReplyBotPlatform.REDDIT]: () =>
          this.getRedditMentions(username, limit),
      },
      {
        logData: { mentionCount: 0, username },
        method: 'getUserMentions',
      },
    );
  }

  /**
   * Get user's timeline/posts
   * This is used for ACCOUNT_MONITOR bot type
   */
  getUserTimeline(
    platform: ReplyBotPlatform,
    username: string,
    options: FetchContentOptions = {},
  ): Promise<SocialContentData[]> {
    const limit = options.limit || 20;

    return this.executePlatformHandler(
      platform,
      {
        [ReplyBotPlatform.TWITTER]: () =>
          this.getTwitterTimeline(username, limit, options.sinceId),
        [ReplyBotPlatform.INSTAGRAM]: () =>
          this.getInstagramTimeline(username, limit),
        [ReplyBotPlatform.TIKTOK]: () =>
          this.getTikTokTimeline(username, limit),
        [ReplyBotPlatform.YOUTUBE]: () =>
          this.getYouTubeTimeline(username, limit),
        [ReplyBotPlatform.REDDIT]: () =>
          this.getRedditTimeline(username, limit),
      },
      {
        logData: { postCount: 0, username },
        method: 'getUserTimeline',
      },
    );
  }

  /**
   * Search content by hashtag or query
   */
  searchContent(
    platform: ReplyBotPlatform,
    query: string,
    options: FetchContentOptions = {},
  ): Promise<SocialContentData[]> {
    const limit = options.limit || 50;

    return this.executePlatformHandler(
      platform,
      {
        [ReplyBotPlatform.TWITTER]: () =>
          this.searchTwitter(query, limit, options.sinceId),
        [ReplyBotPlatform.INSTAGRAM]: () => this.searchInstagram(query, limit),
        [ReplyBotPlatform.TIKTOK]: () => this.searchTikTok(query, limit),
        [ReplyBotPlatform.YOUTUBE]: () => this.searchYouTube(query, limit),
        [ReplyBotPlatform.REDDIT]: () => this.searchReddit(query, limit),
      },
      {
        logData: { query, resultCount: 0 },
        method: 'searchContent',
      },
    );
  }

  /**
   * Filter content based on configured filters
   */
  filterContent(
    content: SocialContentData[],
    filters?: MonitoredAccountFilters,
  ): SocialContentData[] {
    if (!filters) {
      return content;
    }

    return content.filter((item) => {
      // Keyword include filter
      if (filters.keywords?.include && filters.keywords.include.length > 0) {
        const hasIncludeKeyword = filters.keywords.include.some(
          (keyword: string) =>
            item.text.toLowerCase().includes(keyword.toLowerCase()),
        );
        if (!hasIncludeKeyword) {
          return false;
        }
      }

      // Keyword exclude filter
      if (filters.keywords?.exclude && filters.keywords.exclude.length > 0) {
        const hasExcludeKeyword = filters.keywords.exclude.some(
          (keyword: string) =>
            item.text.toLowerCase().includes(keyword.toLowerCase()),
        );
        if (hasExcludeKeyword) {
          return false;
        }
      }

      // Hashtag include filter
      if (filters.hashtags?.include && filters.hashtags.include.length > 0) {
        const hasIncludeHashtag = filters.hashtags.include.some(
          (hashtag: string) =>
            item.text.toLowerCase().includes(`#${hashtag.toLowerCase()}`),
        );
        if (!hasIncludeHashtag) {
          return false;
        }
      }

      // Hashtag exclude filter
      if (filters.hashtags?.exclude && filters.hashtags.exclude.length > 0) {
        const hasExcludeHashtag = filters.hashtags.exclude.some(
          (hashtag: string) =>
            item.text.toLowerCase().includes(`#${hashtag.toLowerCase()}`),
        );
        if (hasExcludeHashtag) {
          return false;
        }
      }

      // Engagement threshold filter
      if (filters.minEngagement && item.metrics) {
        if (
          filters.minEngagement.minLikes &&
          item.metrics.likes < filters.minEngagement.minLikes
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filter out already processed content
   */
  async filterUnprocessedContent(
    content: SocialContentData[],
    organizationId: string,
    botType: ReplyBotType,
  ): Promise<SocialContentData[]> {
    if (content.length === 0) {
      return [];
    }

    const contentIds = content.map((c) => c.id);
    const processedIds = await this.processedTweetsService.getProcessedTweetIds(
      contentIds,
      organizationId,
      botType,
    );

    return content.filter((item) => !processedIds.has(item.id));
  }

  /**
   * URL templates for each platform
   */
  private static readonly PLATFORM_URL_TEMPLATES: Record<
    ReplyBotPlatform,
    (contentId: string, username: string) => string
  > = {
    [ReplyBotPlatform.TWITTER]: (contentId, username) =>
      `https://x.com/${username}/status/${contentId}`,
    [ReplyBotPlatform.INSTAGRAM]: (contentId) =>
      `https://www.instagram.com/p/${contentId}/`,
    [ReplyBotPlatform.TIKTOK]: (contentId, username) =>
      `https://www.tiktok.com/@${username}/video/${contentId}`,
    [ReplyBotPlatform.YOUTUBE]: (contentId) =>
      `https://www.youtube.com/watch?v=${contentId}`,
    [ReplyBotPlatform.REDDIT]: (contentId) =>
      `https://www.reddit.com/comments/${contentId}`,
  };

  /**
   * Build content URL for a platform
   */
  buildContentUrl(
    platform: ReplyBotPlatform,
    contentId: string,
    username: string,
  ): string {
    const template = SocialMonitorService.PLATFORM_URL_TEMPLATES[platform];
    return template ? template(contentId, username) : '';
  }

  // ==================== Platform-Specific Implementations ====================

  // --- Twitter ---
  private async getTwitterReplies(
    tweetId: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const apifyTweets = await this.apifyService.getTwitterTweetReplies(
      tweetId,
      { limit },
    );
    return this.convertTwitterToSocialContent(apifyTweets);
  }

  private async getTwitterMentions(
    username: string,
    limit: number,
    sinceId?: string,
  ): Promise<SocialContentData[]> {
    const apifyTweets = await this.apifyService.getTwitterMentions(username, {
      limit,
      sinceId,
    });
    return this.convertTwitterToSocialContent(apifyTweets);
  }

  private async getTwitterTimeline(
    username: string,
    limit: number,
    sinceId?: string,
  ): Promise<SocialContentData[]> {
    const apifyTweets = await this.apifyService.getTwitterUserTimeline(
      username,
      { limit, sinceId },
    );
    // Filter out retweets and replies
    const originalTweets = apifyTweets.filter(
      (t: ApifyNormalizedTweet) => !t.isRetweet && !t.inReplyToTweetId,
    );
    return this.convertTwitterToSocialContent(originalTweets);
  }

  private async searchTwitter(
    query: string,
    limit: number,
    sinceId?: string,
  ): Promise<SocialContentData[]> {
    const apifyTweets = await this.apifyService.searchTwitterTweets(query, {
      limit,
      sinceId,
    });
    return this.convertTwitterToSocialContent(apifyTweets);
  }

  private convertTwitterToSocialContent(
    tweets: ApifyNormalizedTweet[],
  ): SocialContentData[] {
    return tweets.map((tweet) => ({
      authorAvatarUrl: tweet.authorAvatarUrl,
      authorDisplayName: tweet.authorDisplayName,
      authorFollowersCount: tweet.authorFollowersCount,
      authorId: tweet.authorId,
      authorUsername: tweet.authorUsername,
      contentType: SocialContentType.TWEET,
      contentUrl: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
      createdAt: tweet.createdAt,
      hashtags: tweet.hashtags,
      id: tweet.id,
      inReplyToId: tweet.inReplyToTweetId,
      isRepost: tweet.isRetweet,
      metrics: tweet.metrics
        ? {
            comments: tweet.metrics.replies,
            likes: tweet.metrics.likes,
            shares: tweet.metrics.retweets,
          }
        : undefined,
      platform: ReplyBotPlatform.TWITTER,
      text: tweet.text,
    }));
  }

  // --- Instagram ---
  private async getInstagramComments(
    postUrl: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const comments = await this.apifyService.getInstagramPostComments(postUrl, {
      limit,
    });
    return this.convertInstagramCommentsToSocialContent(comments);
  }

  /**
   * Convert Instagram posts to SocialContentData
   */
  private convertInstagramPostsToSocialContent(
    posts: ApifyInstagramPost[],
    defaultUsername = 'unknown',
    determineContentType = false,
  ): SocialContentData[] {
    return posts.map((post) => ({
      authorId: post.ownerUsername || defaultUsername,
      authorUsername: post.ownerUsername || defaultUsername,
      contentType:
        determineContentType && post.videoUrl
          ? SocialContentType.REEL
          : SocialContentType.POST,
      contentUrl: `https://www.instagram.com/p/${post.shortCode}/`,
      createdAt: post.timestamp ? new Date(post.timestamp) : new Date(),
      hashtags: post.hashtags,
      id: post.id,
      metrics: {
        comments: post.commentsCount || 0,
        likes: post.likesCount || 0,
        views: post.videoViewCount,
      },
      platform: ReplyBotPlatform.INSTAGRAM,
      text: post.caption || '',
    }));
  }

  private async getInstagramMentions(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const posts = await this.apifyService.searchInstagramByHashtag(
      `@${username}`,
      { limit },
    );
    return this.convertInstagramPostsToSocialContent(posts);
  }

  private async getInstagramTimeline(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const posts = await this.apifyService.getInstagramUserPosts(username, {
      limit,
    });
    return this.convertInstagramPostsToSocialContent(posts, username, true);
  }

  private async searchInstagram(
    hashtag: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const posts = await this.apifyService.searchInstagramByHashtag(hashtag, {
      limit,
    });
    return this.convertInstagramPostsToSocialContent(posts);
  }

  private convertInstagramCommentsToSocialContent(
    comments: ApifyNormalizedInstagramComment[],
  ): SocialContentData[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.authorAvatarUrl,
      authorId: comment.authorId,
      authorUsername: comment.authorUsername,
      contentType: SocialContentType.COMMENT,
      createdAt: comment.createdAt,
      id: comment.id,
      metrics: comment.metrics
        ? {
            comments: comment.metrics.replies,
            likes: comment.metrics.likes,
          }
        : undefined,
      parentContentId: comment.postId,
      platform: ReplyBotPlatform.INSTAGRAM,
      text: comment.text,
    }));
  }

  // --- TikTok ---
  private async getTikTokComments(
    videoUrl: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const comments = await this.apifyService.getTikTokVideoComments(videoUrl, {
      limit,
    });
    return this.convertTikTokCommentsToSocialContent(comments);
  }

  /**
   * Convert TikTok videos to SocialContentData
   */
  private convertTikTokVideosToSocialContent(
    videos: ApifyTikTokVideo[],
    defaultUsername = 'unknown',
  ): SocialContentData[] {
    return videos.map((video) => ({
      authorAvatarUrl: video.authorMeta?.avatar,
      authorDisplayName: video.authorMeta?.nickname,
      authorId: video.authorMeta?.id || 'unknown',
      authorUsername: video.authorMeta?.name || defaultUsername,
      contentType: SocialContentType.VIDEO,
      contentUrl: video.webVideoUrl,
      createdAt: video.createTime
        ? new Date(video.createTime * 1000)
        : new Date(),
      id: video.id,
      metrics: {
        comments: video.commentCount || 0,
        likes: video.diggCount || 0,
        shares: video.shareCount || 0,
        views: video.playCount,
      },
      platform: ReplyBotPlatform.TIKTOK,
      text: video.desc || '',
    }));
  }

  private async getTikTokMentions(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const videos = await this.apifyService.searchTikTokByHashtag(
      `@${username}`,
      { limit },
    );
    return this.convertTikTokVideosToSocialContent(videos);
  }

  private async getTikTokTimeline(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const videos = await this.apifyService.getTikTokUserVideos(username, {
      limit,
    });
    return this.convertTikTokVideosToSocialContent(videos, username);
  }

  private async searchTikTok(
    hashtag: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const videos = await this.apifyService.searchTikTokByHashtag(hashtag, {
      limit,
    });
    return this.convertTikTokVideosToSocialContent(videos);
  }

  private convertTikTokCommentsToSocialContent(
    comments: ApifyNormalizedTikTokComment[],
  ): SocialContentData[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.authorAvatarUrl,
      authorDisplayName: comment.authorDisplayName,
      authorId: comment.authorId,
      authorUsername: comment.authorUsername,
      contentType: SocialContentType.COMMENT,
      createdAt: comment.createdAt,
      id: comment.id,
      metrics: comment.metrics
        ? {
            comments: comment.metrics.replies,
            likes: comment.metrics.likes,
          }
        : undefined,
      parentContentId: comment.videoId,
      platform: ReplyBotPlatform.TIKTOK,
      text: comment.text,
    }));
  }

  // --- YouTube ---
  private async getYouTubeComments(
    videoUrl: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const comments = await this.apifyService.getYouTubeVideoComments(videoUrl, {
      limit,
    });
    return this.convertYouTubeCommentsToSocialContent(comments);
  }

  /**
   * Convert YouTube videos to SocialContentData
   */
  private convertYouTubeVideosToSocialContent(
    videos: ApifyYouTubeVideo[],
  ): SocialContentData[] {
    return videos.map((video) => ({
      authorId: video.channelId || 'unknown',
      authorUsername: video.channelName || 'unknown',
      contentType: SocialContentType.VIDEO,
      contentUrl: video.url || `https://www.youtube.com/watch?v=${video.id}`,
      createdAt: video.publishedAt ? new Date(video.publishedAt) : new Date(),
      id: video.id,
      metrics: {
        comments: video.commentCount || 0,
        likes: video.likeCount || 0,
        views: video.viewCount,
      },
      platform: ReplyBotPlatform.YOUTUBE,
      text: video.title || '',
    }));
  }

  private async getYouTubeTimeline(
    channelUrl: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const videos = await this.apifyService.getYouTubeChannelVideos(channelUrl, {
      limit,
    });
    return this.convertYouTubeVideosToSocialContent(videos);
  }

  private async searchYouTube(
    query: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const videos = await this.apifyService.searchYouTubeVideos(query, {
      limit,
    });
    return this.convertYouTubeVideosToSocialContent(videos);
  }

  private convertYouTubeCommentsToSocialContent(
    comments: ApifyNormalizedYouTubeComment[],
  ): SocialContentData[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.authorAvatarUrl,
      authorDisplayName: comment.authorDisplayName,
      authorId: comment.authorId,
      authorUsername: comment.authorDisplayName,
      contentType: SocialContentType.COMMENT,
      createdAt: comment.createdAt,
      id: comment.id,
      metrics: comment.metrics
        ? {
            comments: comment.metrics.replies,
            likes: comment.metrics.likes,
          }
        : undefined,
      parentContentId: comment.videoId,
      platform: ReplyBotPlatform.YOUTUBE,
      text: comment.text,
    }));
  }

  // --- Reddit ---
  private async getRedditComments(
    postUrl: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const comments = await this.apifyService.getRedditPostComments(postUrl, {
      limit,
    });
    return comments.map((comment: ApifyRedditPost) => ({
      authorId: comment.author || 'unknown',
      authorUsername: comment.author || 'unknown',
      contentType: SocialContentType.COMMENT,
      contentUrl: comment.permalink
        ? `https://www.reddit.com${comment.permalink}`
        : undefined,
      createdAt: comment.createdUtc
        ? new Date(comment.createdUtc * 1000)
        : new Date(),
      id: comment.id,
      metrics: {
        comments: comment.numComments || 0,
        likes: comment.score || 0,
      },
      parentContentId: postUrl,
      platform: ReplyBotPlatform.REDDIT,
      text: comment.title || '',
    }));
  }

  private async getRedditMentions(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    // Search for posts mentioning this user
    const posts = await this.apifyService.searchRedditPosts(`u/${username}`, {
      limit,
    });
    return this.convertRedditToSocialContent(posts);
  }

  private async getRedditTimeline(
    username: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const posts = await this.apifyService.getRedditUserPosts(username, {
      limit,
    });
    return this.convertRedditToSocialContent(posts);
  }

  private async searchReddit(
    query: string,
    limit: number,
  ): Promise<SocialContentData[]> {
    const posts = await this.apifyService.searchRedditPosts(query, { limit });
    return this.convertRedditToSocialContent(posts);
  }

  private convertRedditToSocialContent(
    posts: ApifyRedditPost[],
  ): SocialContentData[] {
    return posts.map((post) => ({
      authorId: post.author || 'unknown',
      authorUsername: post.author || 'unknown',
      contentType: SocialContentType.REDDIT_POST,
      contentUrl: post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : post.url,
      createdAt: post.createdUtc
        ? new Date(post.createdUtc * 1000)
        : new Date(),
      id: post.id,
      metrics: {
        comments: post.numComments || 0,
        likes: post.score || 0,
      },
      platform: ReplyBotPlatform.REDDIT,
      text: post.title || '',
    }));
  }
}
