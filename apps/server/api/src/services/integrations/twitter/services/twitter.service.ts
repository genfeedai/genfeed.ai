import { Buffer } from 'node:buffer';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  isTwitterAuthorizationError,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@api-types/contracts/channel-capabilities.contract';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import {
  buildGrantedScopesCredentialPatch,
  SocialUrlHelper,
} from '@genfeedai/helpers';
import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { TwitterApi } from 'twitter-api-v2';
import {
  type TwitterAnalyticsResponse,
  type TwitterAnalyticsResult,
  TwitterResponseMapper,
  type TwitterSearchResponse,
  type TwitterTrendResponse,
  type TwitterTrendResult,
  type TwitterUserResponse,
  type TwitterUsersResponse,
} from './twitter-response.mapper';

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

interface TweetMediaOptions {
  media: {
    media_ids:
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string];
  };
  quote_tweet_id?: string;
  reply_settings?: string;
}

/**
 * Catalog reply-policy values translated to Twitter's `reply_settings`
 * vocabulary. `everyone` is absent on purpose: the API expresses it by omitting
 * the field, and sending an unknown value rejects the whole tweet.
 */
const TWITTER_TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

const TWITTER_REPLY_SETTINGS_BY_POLICY: Record<string, string> = {
  following: 'following',
  mentioned: 'mentionedUsers',
};

export function resolveTwitterReplySettings(
  settings: ChannelTargetSettings,
): string | undefined {
  const policy = readChannelSettingString(settings, 'replyPolicy');
  return policy === undefined
    ? undefined
    : TWITTER_REPLY_SETTINGS_BY_POLICY[policy];
}

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Twitter credential is missing ${field}`);
  }

  return value;
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
    private readonly responseMapper: TwitterResponseMapper,
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

  private shouldRefreshAccessToken(expiresAt?: Date | string | null): boolean {
    if (!expiresAt) {
      return true;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return true;
    }

    return expiresAtMs <= Date.now() + TWITTER_TOKEN_REFRESH_BUFFER_MS;
  }

  public async getValidCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credential = await this.findTwitterCredential(
      organizationId,
      brandId,
      credentialId,
    );

    if (!credential) {
      throw new Error('Twitter credential not found');
    }

    if (
      !credential.accessToken ||
      this.shouldRefreshAccessToken(credential.accessTokenExpiry)
    ) {
      return this.refreshToken(
        organizationId,
        brandId,
        credentialId ?? credential.id,
      );
    }

    return credential;
  }

  /**
   * Reuse the integration's reconnect lifecycle from auxiliary X reads.
   * Returns false for permission, rate-limit, and provider errors so callers
   * can preserve those states without disconnecting a valid credential.
   */
  public async handleAuthorizationError(
    credentialId: string,
    error: unknown,
    context: string,
  ): Promise<boolean> {
    if (
      isTwitterScopeOrTierError(error) ||
      isTwitterRateLimitError(error) ||
      !isTwitterAuthorizationError(error)
    ) {
      return false;
    }

    try {
      await this.credentialsService.patch(credentialId, {
        isConnected: false,
      });
      this.loggerService.warn(
        `${context} - credential marked as disconnected due to auth error`,
        { credentialId },
      );
    } catch (patchError: unknown) {
      this.loggerService.error(
        `${context} - failed to mark credential as disconnected`,
        patchError,
      );
    }

    return true;
  }

  private async findTwitterCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument | null> {
    const platform =
      toPrismaCredentialPlatform(CredentialPlatform.TWITTER) ??
      CredentialPlatform.TWITTER;

    return credentialId
      ? this.credentialsService.findOne({
          id: credentialId,
          organizationId,
          platform,
        })
      : this.credentialsService.findOne({
          brandId,
          isDeleted: false,
          organizationId,
          platform,
        });
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credentials = await this.findTwitterCredential(
      organizationId,
      brandId,
      credentialId,
    );

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
          scope,
        } = await client.refreshOAuth2Token(decryptedRefreshToken);

        return await this.credentialsService.patch(credentials.id, {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken: newRefreshToken,
          ...buildGrantedScopesCredentialPatch(scope),
        });
      } else {
        // OAuth 1.0a credential — requires reconnection via OAuth 2.0
        await this.credentialsService.patch(credentials.id, {
          isConnected: false,
        });
        throw new Error(
          'Twitter credential requires reconnection. Please reconnect your X account.',
        );
      }
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials.id, {
        isConnected: false,
      });

      // Create activity for social integration disconnection
      await this.activitiesService.create(
        new ActivityEntity({
          brandId: brandId,
          key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
          organizationId: organizationId,
          source: ActivitySource.SOCIAL_INTEGRATION,
          userId: credentials.userId ?? undefined,
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

      const tweets = this.responseMapper.mapSearchResults(
        result as unknown as TwitterSearchResponse,
      );

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

      return this.responseMapper.mapUser(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Resolve a brand-scoped X OAuth2 user access token when connected.
   * Returns null when no usable credential exists (caller should fall back).
   */
  public async resolveBrandUserAccessToken(
    organizationId: string,
    brandId: string,
  ): Promise<string | null> {
    try {
      const credentials = await this.credentialsService.findOne({
        brandId: brandId,
        organizationId: organizationId,
        platform: CredentialPlatform.TWITTER,
      });
      if (!credentials?.accessToken || credentials.isConnected === false) {
        return null;
      }
      try {
        return EncryptionUtil.decrypt(credentials.accessToken);
      } catch {
        // Token may already be plain in some test/local paths.
        return credentials.accessToken;
      }
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} resolveBrandUserAccessToken failed`,
        { brandId, error: (error as Error)?.message, organizationId },
      );
      return null;
    }
  }

  /**
   * Public user timeline via official X API v2.
   * Prefer brand OAuth2 user token when provided, else app bearer.
   */
  public async getUserTimelineByUsername(
    username: string,
    options: {
      maxResults?: number;
      excludeReplies?: boolean;
      excludeRetweets?: boolean;
      sinceId?: string;
      /** Decrypted OAuth2 user access token (brand credential). */
      accessToken?: string;
    } = {},
  ): Promise<
    Array<{
      id: string;
      text: string;
      createdAt?: Date;
      authorId?: string;
      authorUsername?: string;
      authorName?: string;
      authorFollowersCount?: number;
      isRetweet: boolean;
      inReplyToId: string | null;
      metrics?: {
        likes: number;
        comments: number;
        shares: number;
      };
    }>
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const cleanUsername = username.replace(/^@/, '');
    const maxResults = Math.min(Math.max(options.maxResults ?? 25, 5), 100);
    const client = options.accessToken
      ? new TwitterApi(options.accessToken)
      : this.twitterClient;

    try {
      const userResult = (await client.v2.get(
        `users/by/username/${encodeURIComponent(cleanUsername)}`,
        { 'user.fields': 'public_metrics' },
      )) as TwitterUserResponse;
      const user = this.responseMapper.mapUser(userResult);
      if (!user) {
        return [];
      }

      const exclude: string[] = [];
      if (options.excludeReplies) {
        exclude.push('replies');
      }
      if (options.excludeRetweets) {
        exclude.push('retweets');
      }

      const params: Record<string, string | number | string[]> = {
        expansions: 'author_id',
        max_results: maxResults,
        'tweet.fields':
          'created_at,public_metrics,author_id,referenced_tweets,in_reply_to_user_id',
        'user.fields': 'username,name,public_metrics',
      };
      if (exclude.length > 0) {
        params.exclude = exclude;
      }
      if (options.sinceId) {
        params.since_id = options.sinceId;
      }

      const result = (await client.v2.get(
        `users/${user.id}/tweets`,
        params,
      )) as {
        data?: Array<{
          id: string;
          text?: string;
          created_at?: string;
          author_id?: string;
          in_reply_to_user_id?: string;
          referenced_tweets?: Array<{ type: string; id: string }>;
          public_metrics?: {
            like_count?: number;
            reply_count?: number;
            retweet_count?: number;
          };
        }>;
        includes?: {
          users?: Array<{
            id: string;
            username?: string;
            name?: string;
            public_metrics?: { followers_count?: number };
          }>;
        };
      };

      const authors = new Map(
        (result.includes?.users ?? []).map((author) => [author.id, author]),
      );

      return (result.data ?? []).map((tweet) => {
        const author = authors.get(tweet.author_id ?? user.id);
        const isRetweet = Boolean(
          tweet.referenced_tweets?.some((ref) => ref.type === 'retweeted'),
        );
        return {
          authorFollowersCount:
            author?.public_metrics?.followers_count ?? user.followersCount,
          authorId: tweet.author_id ?? user.id,
          authorName: author?.name ?? user.name,
          authorUsername: author?.username ?? user.username,
          createdAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
          id: tweet.id,
          inReplyToId: tweet.in_reply_to_user_id ?? null,
          isRetweet,
          metrics: tweet.public_metrics
            ? {
                comments: tweet.public_metrics.reply_count ?? 0,
                likes: tweet.public_metrics.like_count ?? 0,
                shares: tweet.public_metrics.retweet_count ?? 0,
              }
            : undefined,
          text: tweet.text ?? '',
        };
      });
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed for @${cleanUsername}`, error);
      throw error;
    }
  }

  /**
   * Replies in a tweet conversation via official X API v2 recent search.
   * Prefer brand OAuth2 user token when provided, else app bearer.
   * Callers should fall back to Apify when this throws or returns empty
   * (search access is tier-dependent).
   */
  public async getTweetReplies(
    tweetId: string,
    options: {
      maxResults?: number;
      /** Decrypted OAuth2 user access token (brand credential). */
      accessToken?: string;
    } = {},
  ): Promise<
    Array<{
      id: string;
      text: string;
      createdAt?: Date;
      authorId?: string;
      authorUsername?: string;
      authorName?: string;
      authorFollowersCount?: number;
      inReplyToId: string | null;
      metrics?: {
        likes: number;
        comments: number;
        shares: number;
      };
    }>
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const cleanId = tweetId.trim();
    if (!cleanId) {
      return [];
    }

    // Recent search requires max_results between 10 and 100.
    const maxResults = Math.min(Math.max(options.maxResults ?? 25, 10), 100);
    const client = options.accessToken
      ? new TwitterApi(options.accessToken)
      : this.twitterClient;

    try {
      // conversation_id matches the root tweet id for the whole thread.
      const result = (await client.v2.get('tweets/search/recent', {
        expansions: 'author_id',
        max_results: maxResults,
        query: `conversation_id:${cleanId}`,
        'tweet.fields':
          'author_id,created_at,public_metrics,referenced_tweets,conversation_id,in_reply_to_user_id',
        'user.fields': 'username,name,public_metrics',
      })) as {
        data?: Array<{
          id: string;
          text?: string;
          created_at?: string;
          author_id?: string;
          conversation_id?: string;
          referenced_tweets?: Array<{ type: string; id: string }>;
          public_metrics?: {
            like_count?: number;
            reply_count?: number;
            retweet_count?: number;
          };
        }>;
        includes?: {
          users?: Array<{
            id: string;
            username?: string;
            name?: string;
            public_metrics?: { followers_count?: number };
          }>;
        };
      };

      const usersById = new Map(
        (result.includes?.users ?? []).map((user) => [user.id, user]),
      );

      const replies = (result.data ?? [])
        .filter((tweet) => tweet.id !== cleanId)
        .map((tweet) => {
          const author = usersById.get(tweet.author_id ?? '');
          const repliedTo = tweet.referenced_tweets?.find(
            (ref) => ref.type === 'replied_to',
          );
          return {
            authorFollowersCount: author?.public_metrics?.followers_count,
            authorId: tweet.author_id,
            authorName: author?.name,
            authorUsername: author?.username,
            createdAt: tweet.created_at
              ? new Date(tweet.created_at)
              : undefined,
            id: tweet.id,
            inReplyToId: repliedTo?.id ?? cleanId,
            metrics: tweet.public_metrics
              ? {
                  comments: tweet.public_metrics.reply_count ?? 0,
                  likes: tweet.public_metrics.like_count ?? 0,
                  shares: tweet.public_metrics.retweet_count ?? 0,
                }
              : undefined,
            text: tweet.text ?? '',
          };
        });

      this.loggerService.log(
        `${caller} found ${replies.length} replies for conversation ${cleanId}`,
        {
          source: options.accessToken ? 'brand-oauth' : 'app-bearer',
          tweetId: cleanId,
        },
      );

      return replies;
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed for conversation ${cleanId}`,
        error,
      );
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

      return this.responseMapper.mapUsers(result);
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

      return this.responseMapper.mapUsers(result);
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

      return this.responseMapper.mapUsers(result);
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

      return this.responseMapper.mapTrends(
        res as unknown as TwitterTrendResponse[],
        organizationId,
        brandId,
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
      const accessToken = requireString(credential.accessToken, 'accessToken');

      // OAuth 2.0: single bearer token
      const decryptedAccessToken = EncryptionUtil.decrypt(accessToken);
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
    settings: ChannelTargetSettings = {},
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);
      const accessToken = requireString(credential.accessToken, 'accessToken');

      // OAuth 2.0: single bearer token
      const decryptedAccessToken = EncryptionUtil.decrypt(accessToken);
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

      const replySettings = resolveTwitterReplySettings(settings);
      if (replySettings) {
        tweetOptions.reply_settings = replySettings;
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
    settings: ChannelTargetSettings = {},
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);
      const accessToken = requireString(credential.accessToken, 'accessToken');

      const decryptedAccessToken = EncryptionUtil.decrypt(accessToken);
      const userClient = new TwitterApi(decryptedAccessToken);

      const plainTextContent = htmlToText(text);

      const tweetOptions: Record<string, unknown> = {};
      if (inReplyToTweetId) {
        tweetOptions.reply = { in_reply_to_tweet_id: inReplyToTweetId };
      }

      // A reply inherits the parent tweet's audience, so the policy only
      // applies to the root tweet.
      const replySettings = inReplyToTweetId
        ? undefined
        : resolveTwitterReplySettings(settings);
      if (replySettings) {
        tweetOptions.reply_settings = replySettings;
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
   * Fetch a single tweet by id (bearer or brand OAuth when org/brand provided).
   */
  public async getTweetById(
    tweetId: string,
    options: {
      brandId?: string;
      organizationId?: string;
    } = {},
  ): Promise<{
    authorId?: string;
    authorUsername?: string;
    createdAt?: string;
    id: string;
    likeCount?: number;
    replyCount?: number;
    retweetCount?: number;
    text: string;
    url: string;
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      let client = this.twitterClient;
      if (options.organizationId && options.brandId) {
        const credential = await this.refreshToken(
          options.organizationId,
          options.brandId,
        );
        const accessToken = requireString(
          credential.accessToken,
          'accessToken',
        );
        client = new TwitterApi(EncryptionUtil.decrypt(accessToken));
      }

      const response = await client.v2.singleTweet(tweetId, {
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'text'],
        expansions: ['author_id'],
        'user.fields': ['username', 'name'],
      });

      const tweet = response.data;
      if (!tweet?.id || !tweet.text) {
        throw new Error('Tweet not found or incomplete response');
      }

      const author = response.includes?.users?.find(
        (user) => user.id === tweet.author_id,
      );
      const username = author?.username;
      const metrics = tweet.public_metrics;

      return {
        authorId: tweet.author_id,
        authorUsername: username,
        createdAt: tweet.created_at,
        id: tweet.id,
        likeCount: metrics?.like_count,
        replyCount: metrics?.reply_count,
        retweetCount: metrics?.retweet_count,
        text: tweet.text,
        url: this.buildTweetUrl(tweet.id, username || 'i'),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Native repost (retweet) without commentary.
   */
  public async repostTweet(
    organizationId: string,
    brandId: string,
    tweetId: string,
  ): Promise<{ reposted: boolean; tweetId: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const credential = await this.refreshToken(organizationId, brandId);
      const accessToken = requireString(credential.accessToken, 'accessToken');
      const userClient = new TwitterApi(EncryptionUtil.decrypt(accessToken));

      // v2 retweet: POST /2/users/:id/retweets
      const me = await userClient.v2.me();
      const userId = me.data.id;
      await userClient.v2.retweet(userId, tweetId);

      this.loggerService.log(`${caller} success`, { tweetId, userId });
      return { reposted: true, tweetId };
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
  ): Promise<TwitterAnalyticsResult> {
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

      return this.responseMapper.mapAnalytics(
        res as unknown as TwitterAnalyticsResponse,
      );
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
  ): Promise<Map<string, TwitterAnalyticsResult>> {
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

      const results = this.responseMapper.mapAnalyticsBatch(
        res as unknown as TwitterAnalyticsResponse,
      );

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
