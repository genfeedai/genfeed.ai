import type {
  ApifyNormalizedTweet,
  ApifyTrendData,
  ApifyTwitterTrend,
  ApifyTwitterTweet,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyTwitterService
 *
 * Handles all Twitter/X-related Apify scraping operations:
 * trends, mentions, timeline, replies, and search.
 */
@Injectable()
export class ApifyTwitterService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get Twitter/X trending topics
   */
  async getTwitterTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const input = {
        country: options?.region || 'US',
        maxItems: options?.limit || 20,
      };

      const rawTrends = await this.baseService.runActor<ApifyTwitterTrend>(
        this.baseService.ACTORS.TWITTER_TRENDS,
        input,
      );

      return this.normalizeTwitterTrends(rawTrends);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTwitterTrends failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get tweets mentioning a specific user (for Reply Guy bot)
   * Fetches recent replies and mentions of the authenticated user's tweets
   */
  async getTwitterMentions(
    username: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    try {
      const input = {
        maxTweets: options?.limit || 50,
        searchTerms: [`@${username}`],
        sort: 'Latest',
        tweetLanguage: 'en',
      };

      const rawTweets = await this.baseService.runActor<ApifyTwitterTweet>(
        this.baseService.ACTORS.TWITTER_SCRAPER,
        input,
      );

      const normalizedTweets = this.normalizeTwitterTweets(rawTweets);

      // Filter by sinceId if provided
      if (options?.sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(options.sinceId!),
        );
      }

      return normalizedTweets;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTwitterMentions failed for @${username}`,
        error,
      );
      return [];
    }
  }

  /**
   * Get tweets from a specific user's timeline (for Account Monitor bot)
   * Fetches recent tweets from monitored accounts
   */
  async getTwitterUserTimeline(
    username: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    try {
      const input = {
        handles: [username],
        maxTweets: options?.limit || 50,
        sort: 'Latest',
      };

      const rawTweets = await this.baseService.runActor<ApifyTwitterTweet>(
        this.baseService.ACTORS.TWITTER_SCRAPER,
        input,
      );

      const normalizedTweets = this.normalizeTwitterTweets(rawTweets);

      // Filter by sinceId if provided (for incremental fetching)
      if (options?.sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(options.sinceId!),
        );
      }

      return normalizedTweets;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTwitterUserTimeline failed for @${username}`,
        error,
      );
      return [];
    }
  }

  /**
   * Get replies to a specific tweet
   * Used to find reply chains for context
   */
  async getTwitterTweetReplies(
    tweetId: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedTweet[]> {
    try {
      const input = {
        conversationIds: [tweetId],
        maxTweets: options?.limit || 50,
        sort: 'Latest',
      };

      const rawTweets = await this.baseService.runActor<ApifyTwitterTweet>(
        this.baseService.ACTORS.TWITTER_SCRAPER,
        input,
      );

      // Filter to only include replies to this tweet
      const replies = rawTweets.filter(
        (tweet) => tweet.in_reply_to_status_id_str === tweetId,
      );

      return this.normalizeTwitterTweets(replies);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTwitterTweetReplies failed for tweet ${tweetId}`,
        error,
      );
      return [];
    }
  }

  /**
   * Search for tweets by query (hashtag, keyword, etc.)
   * Useful for finding relevant conversations
   */
  async searchTwitterTweets(
    query: string,
    options?: { limit?: number; sinceId?: string },
  ): Promise<ApifyNormalizedTweet[]> {
    try {
      const input = {
        maxTweets: options?.limit || 50,
        searchTerms: [query],
        sort: 'Latest',
        tweetLanguage: 'en',
      };

      const rawTweets = await this.baseService.runActor<ApifyTwitterTweet>(
        this.baseService.ACTORS.TWITTER_SCRAPER,
        input,
      );

      const normalizedTweets = this.normalizeTwitterTweets(rawTweets);

      if (options?.sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(options.sinceId!),
        );
      }

      return normalizedTweets;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchTwitterTweets failed for query "${query}"`,
        error,
      );
      return [];
    }
  }

  private normalizeTwitterTrends(
    trends: ApifyTwitterTrend[],
  ): ApifyTrendData[] {
    return trends.map((trend, index) => ({
      growthRate: this.baseService.calculateGrowthRate(trend.tweetVolume || 0),
      mentions: trend.tweetVolume || 0,
      metadata: {
        category: trend.category,
        hashtags: trend.name.startsWith('#') ? [trend.name.substring(1)] : [],
        rank: trend.rank || index + 1,
        source: 'apify' as const,
        trendType: trend.name.startsWith('#')
          ? ('hashtag' as const)
          : ('topic' as const),
        urls: trend.url ? [trend.url] : [],
      },
      platform: 'twitter',
      topic: trend.name,
      viralityScore: 100 - index * 5, // Higher rank = higher virality
    }));
  }

  /**
   * Normalize raw Apify Twitter data to standardized format
   */
  private normalizeTwitterTweets(
    tweets: ApifyTwitterTweet[],
  ): ApifyNormalizedTweet[] {
    return tweets.map((tweet) => ({
      authorAvatarUrl: tweet.user?.profile_image_url_https,
      authorDisplayName: tweet.user?.name,
      authorFollowersCount: tweet.user?.followers_count,
      authorId: tweet.user?.id_str || '',
      authorUsername: tweet.user?.screen_name || '',
      conversationId: tweet.conversation_id_str,
      createdAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      hashtags:
        tweet.entities?.hashtags?.map((h: { text: string }) => h.text) || [],
      id: tweet.id,
      inReplyToTweetId: tweet.in_reply_to_status_id_str,
      inReplyToUserId: tweet.in_reply_to_user_id_str,
      isQuote: tweet.is_quote_status || false,
      isRetweet: !!tweet.retweeted_status,
      metrics: {
        likes: tweet.favorite_count || 0,
        quotes: tweet.quote_count || 0,
        replies: tweet.reply_count || 0,
        retweets: tweet.retweet_count || 0,
      },
      text: tweet.full_text || tweet.text,
    }));
  }
}
