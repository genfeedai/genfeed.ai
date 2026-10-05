import type {
  ApifyNormalizedTweet,
  ApifyTrendData,
  ApifyTwitterTrend,
  ApifyTwitterTweet,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import type { SocialSourceResearchContext } from '@api/services/source-collector/source-collector.types';
import { normalizeSourcePostFlags } from '@api/services/source-collector/source-post-flags';
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

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly runner: ResearchCollectionRunner,
  ) {}

  /**
   * Get Twitter/X trending topics
   */
  async getTwitterTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const input = {
        locations: [options?.region || 'US'],
        maxTrendsPerLocation: options?.limit || 20,
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
      throw error;
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
      const sinceId = options?.sinceId;
      if (sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(sinceId),
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
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyNormalizedTweet[]> {
    // Hard-fail when Apify is not configured so Following sync cannot look
    // "successful" with zero posts after a silent skip.
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape X timelines',
      );
    }

    try {
      const input = {
        handles: [username],
        maxTweets: options?.limit || 50,
        sort: 'Latest',
      };

      const rawTweets = await (researchContext
        ? this.runner.run<ApifyTwitterTweet>(
            researchContext.organizationId,
            this.baseService.ACTORS.TWITTER_SCRAPER,
            input,
            { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
          )
        : this.baseService.runActor<ApifyTwitterTweet>(
            this.baseService.ACTORS.TWITTER_SCRAPER,
            input,
          ));

      const normalizedTweets = this.normalizeTwitterTweets(rawTweets);

      // Filter by sinceId if provided (for incremental fetching)
      const sinceId = options?.sinceId;
      if (sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(sinceId),
        );
      }

      return normalizedTweets;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getTwitterUserTimeline failed for @${username}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch one tweet by its canonical URL (single-post import fallback).
   * Hard-fails without a token or when the tweet cannot be resolved so the
   * import flow never reports an empty success.
   */
  async getTweetByUrl(
    tweetUrl: string,
    tweetId: string,
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyNormalizedTweet> {
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape X posts',
      );
    }

    const input = {
      maxTweets: 1,
      startUrls: [tweetUrl],
    };

    const rawTweets = await (researchContext
      ? this.runner.run<ApifyTwitterTweet>(
          researchContext.organizationId,
          this.baseService.ACTORS.TWITTER_SCRAPER,
          input,
          { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
        )
      : this.baseService.runActor<ApifyTwitterTweet>(
          this.baseService.ACTORS.TWITTER_SCRAPER,
          input,
        ));

    const tweet = this.normalizeTwitterTweets(rawTweets).find(
      (candidate) => candidate.id === tweetId,
    );
    if (!tweet) {
      throw new Error(
        'Tweet not found via Apify — it may be deleted or private',
      );
    }
    return tweet;
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

      const sinceId = options?.sinceId;
      if (sinceId) {
        return normalizedTweets.filter(
          (tweet) => BigInt(tweet.id) > BigInt(sinceId),
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
    return trends
      .filter(
        (trend): trend is ApifyTwitterTrend & { name: string } =>
          Boolean(trend.name?.trim()) && !trend.isPromoted,
      )
      .map((trend, index) => {
        const isHashtag = trend.isHashtag ?? trend.name.startsWith('#');
        return {
          growthRate: this.baseService.calculateGrowthRate(
            trend.tweetVolume || 0,
          ),
          mentions: trend.tweetVolume || 0,
          metadata: {
            countryCode: trend.countryCode,
            hashtags: isHashtag ? [trend.name.replace(/^#/, '')] : [],
            rank: trend.rank || index + 1,
            source: 'apify' as const,
            trendType: isHashtag ? ('hashtag' as const) : ('topic' as const),
            urls: trend.twitterSearchUrl ? [trend.twitterSearchUrl] : [],
          },
          platform: 'twitter',
          topic: trend.name,
          viralityScore: Math.max(0, 100 - index * 5), // Higher rank = higher virality
        };
      });
  }

  /**
   * Normalize raw Apify Twitter data to standardized format
   */
  private normalizeTwitterTweets(
    tweets: ApifyTwitterTweet[],
  ): ApifyNormalizedTweet[] {
    return tweets.map((tweet) => ({
      ...normalizeSourcePostFlags(tweet),
      authorAvatarUrl: tweet.user?.profile_image_url_https,
      authorDisplayName: tweet.user?.name,
      authorFollowersCount: tweet.user?.followers_count,
      authorId: tweet.user?.id_str || '',
      authorUsername: tweet.user?.screen_name || '',
      conversationId: tweet.conversation_id_str,
      createdAt:
        tweet.created_at && Number.isFinite(Date.parse(tweet.created_at))
          ? new Date(tweet.created_at)
          : undefined,
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
