import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerActivityWriter,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  isTwitterAuthorizationError,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import type { ChannelTargetSettings } from '@genfeedai/api-types/contracts';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
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
import { Inject, Injectable } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';
import { TwitterAnalyticsService } from './twitter-analytics.service';
import {
  type TwitterDirectMessageListing,
  TwitterInboxService,
  type TwitterInboxTweet,
} from './twitter-inbox.service';
import { TwitterPublishingService } from './twitter-publishing.service';
import {
  TwitterReadService,
  type TwitterResolvedUser,
} from './twitter-read.service';
import {
  type TwitterAnalyticsResult,
  TwitterResponseMapper,
  type TwitterTrendResult,
  type TwitterUserResponse,
} from './twitter-response.mapper';

export type {
  TwitterDirectMessageListing,
  TwitterInboxDmMessage,
  TwitterInboxDmThread,
  TwitterInboxTweet,
} from './twitter-inbox.service';
export { resolveTwitterReplySettings } from './twitter-publishing.service';

/**
 * Catalog reply-policy values translated to Twitter's `reply_settings`
 * vocabulary. `everyone` is absent on purpose: the API expresses it by omitting
 * the field, and sending an unknown value rejects the whole tweet.
 */
const TWITTER_TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

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
  private readonly analyticsService: TwitterAnalyticsService;
  private readonly inboxService: TwitterInboxService;
  private readonly publishingService: TwitterPublishingService;
  private readonly readService: TwitterReadService;

  public twitterClient: TwitterApi;

  constructor(
    private readonly configService: ConfigService,

    private readonly loggerService: LoggerService,
    @Inject(SERVER_TOKENS.activities)
    private readonly activitiesService: ServerActivityWriter,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly httpService: HttpService,
    private readonly responseMapper: TwitterResponseMapper,
  ) {
    this.twitterClient = new TwitterApi(
      // @ts-expect-error TS2769
      this.configService.get('TWITTER_BEARER_TOKEN'),
    );
    this.analyticsService = new TwitterAnalyticsService(
      this.configService,
      this.loggerService,
      this.responseMapper,
      () => this.twitterClient,
    );
    this.inboxService = new TwitterInboxService(
      this.loggerService,
      (organizationId, brandId, credentialId) =>
        this.refreshToken(organizationId, brandId, credentialId),
      (tweetId, options) => this.getTweetReplies(tweetId, options),
    );
    this.publishingService = new TwitterPublishingService(
      this.httpService,
      this.loggerService,
      (organizationId, brandId, credentialId) =>
        this.refreshToken(organizationId, brandId, credentialId),
    );
    this.readService = new TwitterReadService(
      this.loggerService,
      this.responseMapper,
      () => this.twitterClient,
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

  /**
   * Resolve the X account to act as.
   *
   * An explicit `credentialId` is exact. Without one the brand-wide fallback
   * only holds while the brand has a single X account — a brand running several
   * accounts has no "the" credential, and posting or refreshing tokens from a
   * guessed one would hit the wrong audience under the wrong identity. That
   * case throws so the caller passes a credentialId instead.
   */
  private async findTwitterCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument | null> {
    if (credentialId) {
      return this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        isDisconnectedIncluded: true,
        organizationId,
        platform: CredentialPlatform.TWITTER,
      });
    }

    const accounts = await this.credentialsService.findBrandAccounts(
      organizationId,
      brandId,
      CredentialPlatform.TWITTER,
    );

    if (accounts.length > 1) {
      throw new Error(
        `Brand ${brandId} has ${accounts.length} connected X accounts; pass an explicit credentialId`,
      );
    }

    return accounts[0] ?? null;
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
      await this.activitiesService.create({
        brandId: brandId,
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        organizationId: organizationId,
        source: ActivitySource.SOCIAL_INTEGRATION,
        userId: credentials.userId ?? undefined,
        value: `Twitter integration disconnected: ${(error as Error)?.message ?? 'Token refresh failed'}`,
      });

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
    return this.readService.searchRecentTweets(query, options);
  }

  /**
   * Resolve a Twitter user by username.
   */
  public async getUserByUsername(
    username: string,
  ): Promise<TwitterResolvedUser | null> {
    return this.readService.getUserByUsername(username);
  }

  /**
   * Resolve a brand-scoped X OAuth2 user access token when connected.
   * Returns null when no usable credential exists (caller should fall back).
   */
  public async resolveBrandUserAccessToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<string | null> {
    try {
      const credentials = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        // The connectedness check below is this method's own; keeping the
        // lookup wide preserves it rather than turning a disconnected
        // account into "no account at all".
        isDisconnectedIncluded: true,
        organizationId,
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
      const searchParams: Record<string, string | number> = {
        expansions: 'author_id',
        max_results: maxResults,
        query: `conversation_id:${cleanId}`,
        'tweet.fields':
          'author_id,created_at,public_metrics,referenced_tweets,conversation_id,in_reply_to_user_id',
        'user.fields': 'username,name,public_metrics',
      };
      if (options.sinceId) {
        searchParams.since_id = options.sinceId;
      }

      const result = (await client.v2.get(
        'tweets/search/recent',
        searchParams,
      )) as {
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
  ): Promise<TwitterResolvedUser[]> {
    return this.readService.getUsers(
      `users/${userId}/followers`,
      options.maxResults,
    );
  }

  /**
   * Get users who liked a tweet.
   */
  public async getTweetLikingUsers(
    tweetId: string,
    options: { maxResults?: number } = {},
  ): Promise<TwitterResolvedUser[]> {
    return this.readService.getUsers(
      `tweets/${tweetId}/liking_users`,
      options.maxResults,
    );
  }

  /**
   * Get users who reposted (retweeted) a tweet.
   */
  public async getTweetRetweetedBy(
    tweetId: string,
    options: { maxResults?: number } = {},
  ): Promise<TwitterResolvedUser[]> {
    return this.readService.getUsers(
      `tweets/${tweetId}/retweeted_by`,
      options.maxResults,
    );
  }

  public async getTrends(
    organizationId?: string,
    brandId?: string,
    woeid = 1,
  ): Promise<TwitterTrendResult[]> {
    return this.readService.getTrends(organizationId, brandId, woeid);
  }

  /**
   * Mentions of the connected account via official X API v2.
   * `sinceId` is the last ingested tweet id and must survive a rate-limit.
   */
  public async listMentions(
    organizationId: string,
    brandId: string,
    options: { limit?: number; sinceId?: string } = {},
    credentialId?: string,
  ): Promise<TwitterInboxTweet[]> {
    return this.inboxService.listMentions(
      organizationId,
      brandId,
      options,
      credentialId,
    );
  }

  /**
   * Replies on one of the brand's tweets, using the connected account token.
   */
  public async listPostReplies(
    organizationId: string,
    brandId: string,
    tweetId: string,
    options: { limit?: number; sinceId?: string } = {},
    credentialId?: string,
  ): Promise<TwitterInboxTweet[]> {
    return this.inboxService.listPostReplies(
      organizationId,
      brandId,
      tweetId,
      options,
      credentialId,
    );
  }

  /**
   * Direct-message events for the connected account. Own sends are dropped so
   * the inbox only records inbound messages.
   */
  public async listDirectMessages(
    organizationId: string,
    brandId: string,
    options: { limit?: number; paginationToken?: string } = {},
    credentialId?: string,
  ): Promise<TwitterDirectMessageListing> {
    return this.inboxService.listDirectMessages(
      organizationId,
      brandId,
      options,
      credentialId,
    );
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
    credentialId?: string,
  ): Promise<void> {
    return this.inboxService.sendCommentReplyDm(
      organizationId,
      brandId,
      recipientId,
      message,
      credentialId,
    );
  }

  /**
   * Upload media (image or video) to Twitter
   * @param mediaUrls Carousel URLs; a single medium is `[url]` (max 4 images)
   * @returns The tweet ID
   */
  public async uploadMedia(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    mediaType: 'image/jpeg' | 'video/mp4' = 'video/mp4',
    quoteTweetId?: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<string> {
    return this.publishingService.uploadMedia(
      organizationId,
      brandId,
      mediaUrls,
      caption,
      mediaType,
      quoteTweetId,
      settings,
      credentialId,
    );
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
    credentialId?: string,
  ): Promise<string> {
    return this.publishingService.postTweet(
      organizationId,
      brandId,
      text,
      inReplyToTweetId,
      settings,
      credentialId,
    );
  }

  /**
   * Fetch a single tweet by id (bearer or brand OAuth when org/brand provided).
   */
  public async getTweetById(
    tweetId: string,
    options: {
      brandId?: string;
      credentialId?: string;
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
          options.credentialId,
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
    credentialId?: string,
  ): Promise<{ reposted: boolean; tweetId: string }> {
    return this.publishingService.repostTweet(
      organizationId,
      brandId,
      tweetId,
      credentialId,
    );
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
    return this.analyticsService.getMediaAnalytics(
      tweetId,
      accessToken,
      accessTokenSecret,
    );
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
    return this.analyticsService.getMediaAnalyticsBatch(
      tweetIds,
      accessToken,
      accessTokenSecret,
    );
  }
}
