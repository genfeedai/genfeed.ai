import { Buffer } from 'node:buffer';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
} from '@genfeedai/enums';
import { SocialUrlHelper } from '@genfeedai/helpers';
import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { TwitterApi } from 'twitter-api-v2';

interface TwitterTrendItem {
  name: string;
  tweet_volume: number | null;
  url: string;
}

interface TwitterMediaItem {
  type: string;
  media_key?: string;
  public_metrics?: { view_count?: number };
}

interface TwitterTrendResult {
  brandId?: string;
  growthRate: number;
  mentions: number;
  organizationId?: string;
  platform: CredentialPlatform;
  topic: string;
  url: string;
}

interface TwitterApiErrorShape {
  code?: number;
  status?: number;
  message?: string;
  data?: unknown;
  rateLimit?: { limit?: string; remaining?: string; reset?: string };
  headers?: Record<string, string>;
  rateLimitReset?: Date;
  rateLimitWaitMs?: number;
}

interface TwitterUserSummary {
  id: string;
  username: string;
  name?: string;
  public_metrics?: {
    followers_count?: number;
  };
}

interface TwitterUserResponse {
  data?: TwitterUserSummary;
}

interface TwitterUsersResponse {
  data?: TwitterUserSummary[];
}

interface TweetMediaOptions {
  media: {
    media_ids:
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string];
  };
  quote_tweet_id?: string;
}

interface TwitterAnalyticsResult {
  views: number;
  likes: number;
  comments: number;
  retweets?: number;
  bookmarks?: number;
  quotes?: number;
  impressions?: number;
  engagementRate?: number;
  mediaType?: 'text' | 'image' | 'video' | 'mixed';
}

@Injectable()
export class TwitterService {
  private readonly constructorName: string = String(this.constructor.name);

  public twitterClient: TwitterApi;

  constructor(
    private readonly configService: ConfigService,

    private readonly loggerService: LoggerService,
    private readonly activitiesService: ActivitiesService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
  ) {
    this.twitterClient = new TwitterApi(
      // @ts-expect-error TS2769
      this.configService.get('TWITTER_BEARER_TOKEN'),
    );
  }

  /**
   * Build a proper Twitter URL with username
   *
   * Twitter URLs require the username in the path for reliable access:
   * ✅ https://x.com/{username}/status/{tweetId}
   * ❌ https://x.com/i/status/{tweetId} (unreliable)
   *
   * @param tweetId - The tweet ID
   * @param username - The Twitter username (with or without @)
   * @returns Canonical Twitter URL
   */
  public buildTweetUrl(tweetId: string, username: string): string {
    return SocialUrlHelper.buildTwitterUrl(tweetId, username);
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const queryCredentials = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.TWITTER,
    };

    const credentials = await this.credentialsService.findOne(queryCredentials);

    if (!credentials) {
      throw new Error('Twitter credential not found');
    }

    try {
      if (credentials.refreshToken) {
        // OAuth 2.0 refresh flow via SDK
        const decryptedRefreshToken = EncryptionUtil.decrypt(
          credentials.refreshToken,
        );

        const client = new TwitterApi({
          clientId: this.configService.get('TWITTER_CLIENT_ID'),
          clientSecret: this.configService.get('TWITTER_CLIENT_SECRET'),
        } as unknown as ConstructorParameters<typeof TwitterApi>[0]);

        const {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn,
        } = await client.refreshOAuth2Token(decryptedRefreshToken);

        return await this.credentialsService.patch(credentials._id, {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken: newRefreshToken,
        });
      } else {
        // OAuth 1.0a credential — requires reconnection via OAuth 2.0
        await this.credentialsService.patch(credentials._id, {
          isConnected: false,
        });
        throw new Error(
          'Twitter credential requires reconnection. Please reconnect your X account.',
        );
      }
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials._id, {
        isConnected: false,
      });

      // Create activity for social integration disconnection
      await this.activitiesService.create(
        new ActivityEntity({
          brand: new Types.ObjectId(brandId),
          key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
          organization: new Types.ObjectId(organizationId),
          source: ActivitySource.SOCIAL_INTEGRATION,
          user: new Types.ObjectId(credentials.user),
          value: `Twitter integration disconnected: ${(error as Error)?.message ?? 'Token refresh failed'}`,
        }),
      );

      throw error;
    }
  }

  /**
   * Search recent tweets via Twitter API v2
   * Returns tweets sorted by engagement (likes + retweets)
   */
  public async searchRecentTweets(
    query: string,
    options: { maxResults?: number; sortOrder?: 'relevancy' | 'recency' } = {},
  ): Promise<ITwitterSearchResult[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { maxResults = 10, sortOrder = 'relevancy' } = options;

    try {
      const result = await this.twitterClient.v2.search(query, {
        expansions: 'author_id',
        max_results: maxResults,
        sort_order: sortOrder,
        'tweet.fields': 'author_id,created_at,public_metrics,entities',
        'user.fields': 'username,name',
      });

      const authorMap = new Map<string, { username: string; name: string }>();
      if (result.includes?.users) {
        for (const user of result.includes.users) {
          authorMap.set(user.id, {
            name: user.name,
            username: user.username,
          });
        }
      }

      const tweets: ITwitterSearchResult[] = [];
      if (result.data?.data) {
        for (const tweet of result.data.data) {
          const author = authorMap.get(tweet.author_id ?? '');
          const metrics = tweet.public_metrics ?? {
            like_count: 0,
            quote_count: 0,
            reply_count: 0,
            retweet_count: 0,
          };

          tweets.push({
            authorName: author?.name ?? 'Unknown',
            authorUsername: author?.username ?? 'unknown',
            createdAt: tweet.created_at ?? new Date().toISOString(),
            engagement:
              (metrics.like_count ?? 0) + (metrics.retweet_count ?? 0),
            id: tweet.id,
            likes: metrics.like_count ?? 0,
            quotes: metrics.quote_count ?? 0,
            replies: metrics.reply_count ?? 0,
            retweets: metrics.retweet_count ?? 0,
            text: tweet.text,
          });
        }
      }

      tweets.sort((a, b) => b.engagement - a.engagement);

      this.loggerService.log(
        `${url} found ${tweets.length} tweets for query "${query}"`,
      );

      return tweets;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Resolve a Twitter user by username.
   */
  public async getUserByUsername(username: string): Promise<{
    id: string;
    username: string;
    name?: string;
    followersCount?: number;
  } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = (await this.twitterClient.v2.get(
        `users/by/username/${encodeURIComponent(username.replace(/^@/, ''))}`,
        { 'user.fields': 'public_metrics' },
      )) as TwitterUserResponse;

      const user = result.data;
      if (!user) {
        return null;
      }

      return {
        followersCount: user.public_metrics?.followers_count,
        id: user.id,
        name: user.name,
        username: user.username,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Get followers for a Twitter user.
   */
  public async getFollowers(
    userId: string,
    options: { maxResults?: number } = {},
  ): Promise<
    Array<{
      id: string;
      username: string;
      name?: string;
      followersCount?: number;
    }>
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { maxResults = 10 } = options;

    try {
      const result = (await this.twitterClient.v2.get(
        `users/${userId}/followers`,
        {
          max_results: Math.min(maxResults, 100),
          'user.fields': 'public_metrics',
        },
      )) as TwitterUsersResponse;

      return this.mapUsersWithFollowerCount(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Get users who liked a tweet.
   */
  public async getTweetLikingUsers(
    tweetId: string,
    options: { maxResults?: number } = {},
  ): Promise<
    Array<{
      id: string;
      username: string;
      name?: string;
      followersCount?: number;
    }>
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { maxResults = 10 } = options;

    try {
      const result = (await this.twitterClient.v2.get(
        `tweets/${tweetId}/liking_users`,
        {
          max_results: Math.min(maxResults, 100),
          'user.fields': 'public_metrics',
        },
      )) as TwitterUsersResponse;

      return this.mapUsersWithFollowerCount(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Get users who reposted (retweeted) a tweet.
   */
  public async getTweetRetweetedBy(
    tweetId: string,
    options: { maxResults?: number } = {},
  ): Promise<
    Array<{
      id: string;
      username: string;
      name?: string;
      followersCount?: number;
    }>
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { maxResults = 10 } = options;

    try {
      const result = (await this.twitterClient.v2.get(
        `tweets/${tweetId}/retweeted_by`,
        {
          max_results: Math.min(maxResults, 100),
          'user.fields': 'public_metrics',
        },
      )) as TwitterUsersResponse;

      return this.mapUsersWithFollowerCount(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  public async getTrends(
    organizationId?: string,
    brandId?: string,
    woeid = 1,
  ): Promise<TwitterTrendResult[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Use bearer token for public trends instead of user auth
      // NOTE: This endpoint requires Twitter API Pro tier access
      const res = await this.twitterClient.v1.trendsByPlace(woeid);

      return (
        res?.[0]?.trends?.slice(0, 10).map((trend: TwitterTrendItem) => ({
          brandId,
          growthRate: this.calculateGrowthRate(trend.tweet_volume || 0),
          mentions: trend.tweet_volume || 0,
          organizationId,
          platform: CredentialPlatform.TWITTER,
          topic: trend.name,
          url: trend.url,
        })) || []
      );
    } catch (error: unknown) {
      const errorObject = error as TwitterApiErrorShape;

      // Check if this is an API access level error (403/453)
      const isAccessLevelError =
        errorObject?.code === 453 ||
        errorObject?.status === 403 ||
        (errorObject?.message &&
          (errorObject.message.includes('access level') ||
            errorObject.message.includes('453') ||
            errorObject.message.includes('different access level')));

      if (isAccessLevelError) {
        this.loggerService.warn(
          `${url} requires X API credits (PAYG). Returning empty results.`,
          {
            code: errorObject?.code,
            error: errorObject?.message,
            solution:
              'Add X API credits to your Developer Console: https://docs.x.com/x-api/getting-started/pricing',
            status: errorObject?.status,
          },
        );
      } else {
        this.loggerService.error(`${url} failed`, error);
      }

      // Return empty array - no fake data
      return [];
    }
  }

  /**
   * Calculate growth rate based on tweet volume
   * Higher volume = higher growth rate
   */
  private calculateGrowthRate(tweetVolume: number): number {
    if (tweetVolume === 0) {
      return 0;
    }

    // Normalize to 0-100 scale
    // Assuming max volume is 1M tweets
    const normalized = Math.min((tweetVolume / 1000000) * 100, 100);
    return Math.round(normalized);
  }

  private mapUsersWithFollowerCount(result: TwitterUsersResponse): Array<{
    id: string;
    username: string;
    name?: string;
    followersCount?: number;
  }> {
    return (result.data ?? []).map((user) => ({
      followersCount: user.public_metrics?.followers_count,
      id: user.id,
      name: user.name,
      username: user.username,
    }));
  }

  /**
   * Send a direct message in response to a comment reply
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param recipientId The Twitter user ID of the commenter
   * @param message The message to send
   */
  public async sendCommentReplyDm(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Twitter credential not found or invalid');
      }

      // OAuth 2.0: single bearer token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const userClient = new TwitterApi(decryptedAccessToken);

      await userClient.v2.sendDmInConversation(recipientId, {
        text: message,
      });

      this.loggerService.log(`${url} success`, { recipientId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Upload media (image or video) to Twitter
   * Supports single media or carousel (up to 4 images)
   * @param mediaUrl Single URL or array of URLs for carousel
   * @returns The tweet ID
   */
  public async uploadMedia(
    organizationId: string,
    brandId: string,
    mediaUrl: string | string[],
    caption: string,
    mediaType: 'image/jpeg' | 'video/mp4' = 'video/mp4',
    quoteTweetId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Twitter credential not found or invalid');
      }

      // OAuth 2.0: single bearer token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const userClient = new TwitterApi(decryptedAccessToken);

      // Handle single or multiple media URLs
      const mediaUrls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];

      // Twitter allows max 4 images in a tweet
      if (mediaUrls.length > 4) {
        throw new Error('Twitter supports maximum 4 images per tweet');
      }

      // Upload all media files
      const mediaIds: string[] = [];
      for (const url of mediaUrls) {
        const mediaRes = await firstValueFrom(
          this.httpService.get(url, {
            responseType: 'arraybuffer',
          }),
        );

        const mediaId = await userClient.v2.uploadMedia(
          Buffer.from(mediaRes.data),
          { media_type: mediaType },
        );

        mediaIds.push(mediaId);
      }

      // Convert HTML caption to plain text (preserves line breaks)
      const plainTextCaption = htmlToText(caption);

      // Post tweet with all media
      // Type assertion: Twitter API expects tuple of 1-4 strings, not string[]
      const tweetOptions: TweetMediaOptions = {
        media: {
          media_ids: mediaIds as
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string],
        },
      };

      // Add quote tweet if provided
      if (quoteTweetId) {
        tweetOptions.quote_tweet_id = quoteTweetId;
      }

      const tweetRes = await userClient.v2.tweet(
        plainTextCaption,
        tweetOptions,
      );

      const tweetId = tweetRes?.data?.id;

      this.loggerService.log(`${url} success`, {
        mediaCount: mediaIds.length,
        tweetId,
      });

      return tweetId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Post a text-only tweet (or reply to a tweet) using Twitter API v2.
   * @param organizationId Organization ID for credential lookup
   * @param brandId Brand ID for credential lookup
   * @param text Tweet text content
   * @param inReplyToTweetId Optional tweet ID to reply to
   * @returns The created tweet ID
   */
  public async postTweet(
    organizationId: string,
    brandId: string,
    text: string,
    inReplyToTweetId?: string,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Twitter credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const userClient = new TwitterApi(decryptedAccessToken);

      const plainTextContent = htmlToText(text);

      const tweetOptions: Record<string, unknown> = {};
      if (inReplyToTweetId) {
        tweetOptions.reply = { in_reply_to_tweet_id: inReplyToTweetId };
      }

      const tweetRes = await userClient.v2.tweet(
        plainTextContent,
        tweetOptions,
      );

      const tweetId = tweetRes?.data?.id;

      this.loggerService.log(`${caller} success`, { tweetId });

      return tweetId;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Get analytics for any Twitter media (tweets with text, images, or videos)
   * @param tweetId The ID of the tweet
   * @param accessToken Optional user access token for private metrics
   * @param accessTokenSecret Optional user access token secret
   * @returns Analytics data including views, likes, comments, retweets, bookmarks, quotes
   */
  public async getMediaAnalytics(
    tweetId: string,
    accessToken?: string,
    accessTokenSecret?: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    retweets?: number;
    bookmarks?: number;
    quotes?: number;
    impressions?: number;
    engagementRate?: number;
    mediaType?: 'text' | 'image' | 'video' | 'mixed';
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let client = this.twitterClient;

      // Use user client if credentials provided for more detailed metrics
      if (accessToken && accessTokenSecret) {
        client = new TwitterApi({
          // @ts-expect-error TS2769
          accessSecret: accessTokenSecret,
          accessToken,
          appKey: this.configService.get('TWITTER_CONSUMER_KEY'),
          appSecret: this.configService.get('TWITTER_CONSUMER_SECRET'),
        });
      }

      const fields = 'public_metrics,non_public_metrics,organic_metrics';

      // Fetch tweet with all available metrics and media information
      const res = await client.v2.get('tweets', {
        expansions: 'attachments.media_keys',
        ids: tweetId,
        'media.fields': `${fields},type`,
        'tweet.fields': `${fields},attachments`,
      });

      const tweet = res?.data?.[0];
      const metrics = tweet?.public_metrics || {};
      const nonPublicMetrics = tweet?.non_public_metrics || {};
      const organicMetrics = tweet?.organic_metrics || {};

      // Determine media type from attachments
      let mediaType: 'text' | 'image' | 'video' | 'mixed' = 'text';
      const media = res?.includes?.media || [];

      if (media.length > 0) {
        const mediaTypes = new Set(media.map((m: TwitterMediaItem) => m.type));
        if (mediaTypes.size > 1) {
          mediaType = 'mixed';
        } else if (mediaTypes.has('video') || mediaTypes.has('animated_gif')) {
          mediaType = 'video';
        } else if (mediaTypes.has('photo')) {
          mediaType = 'image';
        }
      }

      // Calculate engagement rate if we have impression data
      const impressions =
        nonPublicMetrics.impression_count ||
        organicMetrics.impression_count ||
        0;

      const totalEngagements =
        (metrics.like_count || 0) +
        (metrics.retweet_count || 0) +
        (metrics.reply_count || 0) +
        (metrics.quote_count || 0);

      const engagementRate =
        impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

      // For video tweets, try to get video-specific metrics
      let videoViews = metrics.view_count || 0;
      if (mediaType === 'video' && media.length > 0) {
        const videoMedia = media.find(
          (m: TwitterMediaItem) => m.type === 'video',
        );
        if (videoMedia?.public_metrics?.view_count) {
          videoViews = videoMedia.public_metrics.view_count;
        }
      }

      return {
        bookmarks: metrics.bookmark_count || 0,
        comments: metrics.reply_count || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: impressions || undefined,
        likes: metrics.like_count || 0,
        mediaType,
        quotes: metrics.quote_count || 0,
        retweets: metrics.retweet_count || 0,
        views: videoViews || impressions || 0,
      };
    } catch (error: unknown) {
      // Handle rate limit (429) errors first - don't log as error
      const errorObject = error as TwitterApiErrorShape;
      if (errorObject?.rateLimit || errorObject?.code === 429) {
        const rateLimit = errorObject?.rateLimit || {
          limit: errorObject?.headers?.['x-rate-limit-limit'],
          remaining: errorObject?.headers?.['x-rate-limit-remaining'],
          reset: errorObject?.headers?.['x-rate-limit-reset'],
        };

        if (rateLimit.reset) {
          const resetTime = new Date(parseInt(rateLimit.reset, 10) * 1000);
          const waitTime = Math.max(0, resetTime.getTime() - Date.now());

          // Add rate limit info to error for upstream handling
          errorObject.rateLimitReset = resetTime;
          errorObject.rateLimitWaitMs = waitTime;

          // Only log rate limit warning, not an error
          this.loggerService.warn(
            `${url} rate limited - reset at ${resetTime.toISOString()} (${Math.round(waitTime / 1000)}s wait)`,
            { rateLimit },
          );
        }

        throw error;
      }

      // Log non-rate-limit errors
      const errorData = errorObject?.data || error;
      this.loggerService.error(`${url} failed`, errorData);

      throw error;
    }
  }

  /**
   * Get analytics for multiple Twitter media in a single batch request
   * @param tweetIds Array of tweet IDs (max 100 per request)
   * @param accessToken Optional user access token for private metrics
   * @param accessTokenSecret Optional user access token secret
   * @returns Map of tweetId to analytics data
   */
  public async getMediaAnalyticsBatch(
    tweetIds: string[],
    accessToken?: string,
    accessTokenSecret?: string,
  ): Promise<
    Map<
      string,
      {
        views: number;
        likes: number;
        comments: number;
        retweets?: number;
        bookmarks?: number;
        quotes?: number;
        impressions?: number;
        engagementRate?: number;
        mediaType?: 'text' | 'image' | 'video' | 'mixed';
      }
    >
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (tweetIds.length === 0) {
      return new Map();
    }

    if (tweetIds.length > 100) {
      throw new Error('Twitter API supports maximum 100 tweet IDs per request');
    }

    try {
      let client = this.twitterClient;

      // Use user client if credentials provided for more detailed metrics
      if (accessToken && accessTokenSecret) {
        client = new TwitterApi({
          // @ts-expect-error TS2769
          accessSecret: accessTokenSecret,
          accessToken,
          appKey: this.configService.get('TWITTER_CONSUMER_KEY'),
          appSecret: this.configService.get('TWITTER_CONSUMER_SECRET'),
        });
      }

      const fields = 'public_metrics,non_public_metrics,organic_metrics';

      // Fetch multiple tweets with all available metrics and media information
      const res = await client.v2.get('tweets', {
        expansions: 'attachments.media_keys',
        ids: tweetIds.join(','),
        'media.fields': `${fields},type`,
        'tweet.fields': `${fields},attachments`,
      });

      this.loggerService.log('Twitter API  client.v2.get tweets', res);

      const tweets = res?.data || [];
      const media = res?.includes?.media || [];

      // Create a map for quick media lookup by key
      const mediaByKey = new Map<string, TwitterMediaItem>();
      media.forEach((m: TwitterMediaItem) => {
        // @ts-expect-error TS2345
        mediaByKey.set(m.media_key, m);
      });

      // Process each tweet and build result map
      const results = new Map<string, TwitterAnalyticsResult>();

      for (const tweet of tweets) {
        const metrics = tweet?.public_metrics || {};
        const nonPublicMetrics = tweet?.non_public_metrics || {};
        const organicMetrics = tweet?.organic_metrics || {};

        // Determine media type from attachments
        let mediaType: 'text' | 'image' | 'video' | 'mixed' = 'text';
        const tweetMedia: TwitterMediaItem[] = [];

        if (tweet.attachments?.media_keys) {
          for (const key of tweet.attachments.media_keys) {
            const m = mediaByKey.get(key);
            if (m) {
              tweetMedia.push(m);
            }
          }
        }

        if (tweetMedia.length > 0) {
          const mediaTypes = new Set(
            tweetMedia.map((m: TwitterMediaItem) => m.type),
          );
          if (mediaTypes.size > 1) {
            mediaType = 'mixed';
          } else if (
            mediaTypes.has('video') ||
            mediaTypes.has('animated_gif')
          ) {
            mediaType = 'video';
          } else if (mediaTypes.has('photo')) {
            mediaType = 'image';
          }
        }

        // Calculate engagement rate if we have impression data
        const impressions =
          nonPublicMetrics.impression_count ||
          organicMetrics.impression_count ||
          0;

        const totalEngagements =
          (metrics.like_count || 0) +
          (metrics.retweet_count || 0) +
          (metrics.reply_count || 0) +
          (metrics.quote_count || 0);

        const engagementRate =
          impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

        // For video tweets, try to get video-specific metrics
        let videoViews = metrics.view_count || 0;
        if (mediaType === 'video' && tweetMedia.length > 0) {
          const videoMedia = tweetMedia.find(
            (m: TwitterMediaItem) => m.type === 'video',
          );
          if (videoMedia?.public_metrics?.view_count) {
            videoViews = videoMedia.public_metrics.view_count;
          }
        }

        results.set(tweet.id, {
          bookmarks: metrics.bookmark_count || 0,
          comments: metrics.reply_count || 0,
          engagementRate:
            engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
          impressions: impressions || undefined,
          likes: metrics.like_count || 0,
          mediaType,
          quotes: metrics.quote_count || 0,
          retweets: metrics.retweet_count || 0,
          views: videoViews || impressions || 0,
        });
      }

      this.loggerService.log(
        `${url} success - fetched analytics for ${results.size} tweets`,
      );

      return results;
    } catch (error: unknown) {
      const errorObject = error as TwitterApiErrorShape;
      // Handle rate limit (429) errors first - don't log as error
      if (errorObject?.rateLimit || errorObject?.code === 429) {
        const rateLimit = errorObject?.rateLimit || {
          limit: errorObject?.headers?.['x-rate-limit-limit'],
          remaining: errorObject?.headers?.['x-rate-limit-remaining'],
          reset: errorObject?.headers?.['x-rate-limit-reset'],
        };

        if (rateLimit.reset) {
          const resetTime = new Date(parseInt(rateLimit.reset, 10) * 1000);
          const waitTime = Math.max(0, resetTime.getTime() - Date.now());

          // Add rate limit info to error for upstream handling
          errorObject.rateLimitReset = resetTime;
          errorObject.rateLimitWaitMs = waitTime;

          // Only log rate limit warning, not an error
          this.loggerService.warn(
            `${url} rate limited - reset at ${resetTime.toISOString()} (${Math.round(waitTime / 1000)}s wait)`,
            { rateLimit },
          );
        }

        throw error;
      }

      // Log non-rate-limit errors
      const errorData = errorObject?.data || errorObject;
      this.loggerService.error(`${url} failed`, errorData);

      throw error;
    }
  }
}
