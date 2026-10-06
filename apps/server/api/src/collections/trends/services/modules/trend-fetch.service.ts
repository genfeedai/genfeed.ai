import { createHash } from 'node:crypto';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  ApifyTrendItem,
  TrendData,
} from '@api/collections/trends/interfaces/trend.interfaces';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { TrendRefreshHealthService } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import {
  captureTrendRefreshEvidence,
  getTrendNativeFailureReason,
  markTrendRefreshPersistenceFailed,
  recordTrendProviderOutcome,
  skipTrendRefreshAttempt,
  withTrendRefreshAttempt,
} from '@api/collections/trends/utils/trend-refresh-evidence.util';
import { CacheService } from '@api/services/cache/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { GrokTrendData } from '@api/services/integrations/xai/dto/grok-trends.dto';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';

export interface TrendProviderExecutionOptions {
  allowApifyFallback?: boolean;
}

export interface TrendFetchBatchOptions extends TrendProviderExecutionOptions {
  platforms?: string[];
}

export class TrendFetchService {
  /**
   * Apify bills per actor run, so this TTL is a spend control, not a freshness
   * knob. It deduplicates retries and manual refreshes inside a six-hour window,
   * while the canonical twelve-hour schedule still obtains a fresh dataset.
   */
  private readonly GLOBAL_TRENDS_TTL_SECONDS = 6 * 60 * 60; // 6 hours
  /**
   * Personalized results are cached too. Bypassing the cache whenever an
   * organization or brand is in scope turned every authenticated read into a
   * fresh multi-platform scrape.
   */
  private readonly PERSONALIZED_TRENDS_TTL_SECONDS = 60 * 60; // 1 hour
  /**
   * Empty results are cached deliberately: without negative caching a platform
   * that returns nothing (or is failing) is re-scraped at full rate forever.
   */
  private readonly EMPTY_TRENDS_TTL_SECONDS = 15 * 60; // 15 minutes
  private readonly PERSONALIZED_TWITTER_TRENDS_TTL_SECONDS = 15 * 60; // 15 minutes, matches the inspiration-spec ephemeral cache pattern
  private readonly CACHE_PREFIX = 'trends';
  private readonly GLOBAL_TREND_DOCUMENT_TTL_MINUTES = 48 * 60;
  private readonly PERSONALIZED_TREND_DOCUMENT_TTL_MINUTES = 10;
  private readonly YEAR_TOKEN_PATTERN = /\b(20\d{2})\b/;
  private readonly HISTORICAL_CONTEXT_PATTERN =
    /\b(completed|ended|highlights?\s+from|opening ceremony from|closing ceremony from|recap|throwback|archive|from\s+20\d{2})\b/i;
  private readonly CURRENT_TRIGGER_PATTERN =
    /\b(today|tonight|this week|now|currently|new|latest|ongoing|live|breaking|just announced|released|launch|current)\b/i;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly apifyService: ApifyService,
    private readonly instagramService: InstagramService,
    private readonly linkedinService: LinkedInService,
    private readonly xaiService: XaiService,
    private readonly twitterService: TwitterService,
    private readonly redditService: RedditService,
    private readonly youtubeService: YoutubeService,
    private readonly pinterestService: PinterestService,
    private readonly tiktokService: TiktokService,
    private readonly refreshHealth: TrendRefreshHealthService,
  ) {}

  /**
   * Convert Apify trend data to TrendData format
   */
  toTrendData(trend: ApifyTrendItem): TrendData {
    return {
      growthRate: trend.growthRate,
      mentions: trend.mentions,
      metadata: trend.metadata,
      platform: trend.platform,
      topic: trend.topic,
    };
  }

  /**
   * Batch convert Apify trends to TrendData format
   */
  toTrendDataArray(trends: ApifyTrendItem[]): TrendData[] {
    return trends.map((t) => this.toTrendData(t));
  }

  /**
   * Fetch Twitter/X trends: official X API first (cached org/brand-keyed),
   * falling back to Grok with Apify fallback when the X API has no signal.
   */
  async fetchTwitterTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    const cacheKey = this.buildPersonalizedTwitterTrendsCacheKey(
      organizationId,
      brandId,
      allowApifyFallback,
    );

    if (cacheKey) {
      const cached = await this.cacheService.get<TrendData[]>(cacheKey);
      if (cached) {
        skipTrendRefreshAttempt();
        this.loggerService.debug('Cache hit for personalized X trends', {
          brandId,
          organizationId,
        });
        return cached;
      }
    }

    const trends = await this.resolveTwitterTrends(
      organizationId,
      brandId,
      allowApifyFallback,
    );

    if (cacheKey && trends.length > 0) {
      await this.cacheService.set(cacheKey, trends, {
        tags: this.buildPersonalizedTwitterTrendsCacheTags(
          organizationId,
          brandId,
        ),
        ttl: this.PERSONALIZED_TWITTER_TRENDS_TTL_SECONDS,
      });
    }

    return trends;
  }

  private async resolveTwitterTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    let nativeReason: 'native_empty' | 'native_failed' = 'native_empty';
    const officialTrends = await this.twitterService
      .getTrends(organizationId, brandId)
      .catch(() => {
        nativeReason = 'native_failed';
        return [];
      });

    if (getTrendNativeFailureReason() === 'native_failed')
      nativeReason = 'native_failed';
    if (officialTrends.length > 0) {
      recordTrendProviderOutcome('native_available');
      return officialTrends.map((trend) => ({
        growthRate: trend.growthRate,
        mentions: trend.mentions,
        metadata: {
          source: 'x-api',
          url: trend.url,
        },
        platform: 'twitter',
        topic: trend.topic,
      }));
    }

    if (!allowApifyFallback) {
      recordTrendProviderOutcome(nativeReason, nativeReason);
      return [];
    }

    try {
      const grokTrends = await this.xaiService.getTrends({
        limit: 10,
        region: 'US',
      });
      const validGrokTrends = grokTrends.filter((trend) => {
        const rejectionReason = this.getRejectedGrokTrendReason(trend);

        if (!rejectionReason) {
          return true;
        }

        this.loggerService.warn(
          `Rejected Grok Twitter trend "${trend.topic}" (${rejectionReason})`,
        );
        return false;
      });

      if (validGrokTrends.length > 0) {
        recordTrendProviderOutcome('fallback_available', nativeReason);
        return validGrokTrends.map((trend) => ({
          growthRate: trend.growthRate,
          mentions: trend.mentions,
          metadata: {
            contentAngle: trend.contentAngle,
            context: trend.context,
            hashtags: trend.hashtags,
            source: 'grok-4',
          },
          platform: 'twitter',
          topic: trend.topic,
        }));
      }

      if (!allowApifyFallback) return [];
      this.loggerService.warn(
        'All Grok Twitter trends were rejected as stale, falling back to Apify',
      );
    } catch {
      if (!allowApifyFallback) return [];
    }

    return this.fetchTwitterApifyFallback(nativeReason);
  }

  private async fetchTwitterApifyFallback(
    nativeReason: 'native_empty' | 'native_failed',
  ): Promise<TrendData[]> {
    try {
      const apifyTrends = await this.apifyService.getTwitterTrends({
        limit: 20,
      });
      recordTrendProviderOutcome(
        apifyTrends.length ? 'fallback_available' : 'fallback_empty',
        nativeReason,
      );
      return this.toTrendDataArray(apifyTrends);
    } catch (error: unknown) {
      recordTrendProviderOutcome('fallback_failed', 'provider_failed');
      this.loggerService.error('twitter Apify trend fallback failed', error);
      return [];
    }
  }

  private buildPersonalizedTwitterTrendsCacheKey(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): string | null {
    if (!organizationId && !brandId) {
      return null;
    }

    const fingerprint = createHash('sha256')
      .update([organizationId ?? '', brandId ?? ''].join('|'))
      .digest('hex');

    return this.cacheService.generateKey(
      'trends',
      'twitter-personalized',
      fingerprint,
      allowApifyFallback ? 'fallback' : 'native-only',
    );
  }

  private buildPersonalizedTwitterTrendsCacheTags(
    organizationId?: string,
    brandId?: string,
  ): string[] {
    const tags = ['trends', 'trends:twitter'];

    if (organizationId) {
      tags.push(`trends:twitter:${organizationId}`);
    }

    if (brandId) {
      tags.push(`trends:twitter:${brandId}`);
    }

    return tags;
  }

  private getRejectedGrokTrendReason(
    trend: GrokTrendData,
  ): 'historical-context' | 'past-year-token' | null {
    const currentYear = new Date().getUTCFullYear();
    const topicYear = this.getPastYearToken(
      trend.topic,
      trend.hashtags,
      currentYear,
    );

    if (topicYear) {
      return 'past-year-token';
    }

    if (
      this.HISTORICAL_CONTEXT_PATTERN.test(trend.context) &&
      !this.CURRENT_TRIGGER_PATTERN.test(trend.context)
    ) {
      return 'historical-context';
    }

    return null;
  }

  private getPastYearToken(
    topic: string,
    hashtags: string[],
    currentYear: number,
  ): number | null {
    const values = [topic, ...hashtags];

    for (const value of values) {
      const match = value.match(this.YEAR_TOKEN_PATTERN);
      if (!match) {
        continue;
      }

      const year = Number(match[1]);
      if (year < currentYear) {
        return year;
      }
    }

    return null;
  }

  /**
   * Fetch LinkedIn trend signals from public LinkedIn pages via LinkedInService.
   */
  async fetchLinkedInTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendData[]> {
    const linkedinTopics = await this.linkedinService.getTrends(
      organizationId,
      brandId,
    );

    if (linkedinTopics.length || !getTrendNativeFailureReason())
      recordTrendProviderOutcome(
        linkedinTopics.length ? 'native_available' : 'native_empty',
      );
    return linkedinTopics.map((topic) => ({
      growthRate: topic.growthRate,
      mentions: topic.mentions,
      metadata: topic.metadata,
      platform: 'linkedin',
      topic: topic.topic,
    }));
  }

  private async fetchRedditTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    return this.fetchNativeFirst(
      'reddit',
      async () => {
        const trends = await this.redditService.getTrends(
          organizationId,
          brandId,
          20,
        );
        return trends.map((trend) => ({
          createdAt: trend.createdAt,
          growthRate: trend.upvoteRatio * 100,
          mentions: trend.score,
          metadata: {
            author: trend.author,
            commentCount: trend.commentCount,
            provider: 'reddit-api',
            source: 'native-api',
            subreddit: trend.subreddit,
            trendType: 'topic',
            urls: trend.url ? [trend.url] : [],
          },
          platform: 'reddit',
          topic: trend.title,
        }));
      },
      async () =>
        this.toTrendDataArray(
          await this.apifyService.getRedditTrends({ limit: 20 }),
        ),
      allowApifyFallback,
    );
  }

  private async fetchYoutubeTrends(
    allowApifyFallback = true,
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendData[]> {
    let query: string | undefined;
    if (organizationId && brandId) {
      const [brand, preferences] = await Promise.all([
        this.prisma.brand.findFirst({
          select: { description: true },
          where: { id: brandId, organizationId, isDeleted: false },
        }),
        this.prisma.trendPreferences.findFirst({
          select: { config: true },
          where: { brandId, organizationId, isDeleted: false },
        }),
      ]);
      if (!brand) return [];
      const config = preferences?.config;
      const keywords =
        config &&
        typeof config === 'object' &&
        !Array.isArray(config) &&
        Array.isArray(config.keywords)
          ? config.keywords.filter(
              (word): word is string =>
                typeof word === 'string' && Boolean(word.trim()),
            )
          : [];
      const words = (brand.description ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(
          (word) =>
            (word.length > 2 || word === 'ai') &&
            !new Set([
              'the',
              'and',
              'for',
              'with',
              'your',
              'our',
              'that',
              'from',
              'using',
            ]).has(word),
        );
      query = keywords.length
        ? keywords.slice(0, 5).join('|')
        : Array.from(new Set(words)).slice(0, 5).join(' ');
      if (!query) return [];
      // A scoped search never falls back to an unrelated global chart.
      allowApifyFallback = false;
    }
    return this.fetchNativeFirst(
      'youtube',
      async () => {
        const trends = query
          ? await this.youtubeService.getTrends('US', 20, query)
          : await this.youtubeService.getTrends('US', 20);
        return trends.map((trend) => ({
          createdAt: trend.publishedAt,
          growthRate:
            trend.viewCount > 0
              ? Math.min(
                  100,
                  ((trend.likeCount + trend.commentCount) / trend.viewCount) *
                    100,
                )
              : 0,
          mentions: trend.viewCount,
          metadata: {
            commentCount: trend.commentCount,
            creatorHandle: trend.channelTitle,
            hashtags: trend.tags,
            likeCount: trend.likeCount,
            provider: 'youtube-data-api-v3',
            source: 'native-api',
            thumbnailUrl: trend.thumbnailUrl,
            trendType: 'video',
            videoUrl: trend.url,
            viewCount: trend.viewCount,
          },
          platform: 'youtube',
          topic: trend.title,
        }));
      },
      async () =>
        this.toTrendDataArray(
          await this.apifyService.getYouTubeTrends({ limit: 20 }),
        ),
      allowApifyFallback,
    );
  }

  private async fetchPinterestTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    return this.fetchNativeFirst(
      'pinterest',
      async () => {
        const trends = await this.pinterestService.getTrends(
          organizationId,
          brandId,
          'US',
          20,
        );
        return trends.map((trend) => ({
          growthRate: trend.weeklyGrowth,
          mentions: this.getLatestPinterestTrendValue(trend.timeSeries),
          metadata: {
            monthlyGrowth: trend.monthlyGrowth,
            provider: 'pinterest-api-v5',
            source: 'native-api',
            timeSeries: trend.timeSeries,
            trendType: 'topic',
            yearlyGrowth: trend.yearlyGrowth,
          },
          platform: 'pinterest',
          topic: trend.keyword,
        }));
      },
      async () =>
        this.toTrendDataArray(
          await this.apifyService.getPinterestTrends({ limit: 20 }),
        ),
      allowApifyFallback,
    );
  }

  private async fetchNativeFirst(
    platform: string,
    nativeFetch: () => Promise<TrendData[]>,
    fallbackFetch: () => Promise<TrendData[]>,
    allowApifyFallback: boolean,
  ): Promise<TrendData[]> {
    let reason: 'native_empty' | 'native_failed' | 'native_unavailable' =
      'native_empty';
    try {
      const nativeTrends = await nativeFetch();
      if (nativeTrends.length > 0) {
        recordTrendProviderOutcome('native_available');
        return nativeTrends;
      }
      reason = getTrendNativeFailureReason() ?? 'native_empty';
    } catch {
      reason = 'native_failed';
    }
    if (!allowApifyFallback) {
      recordTrendProviderOutcome(
        reason === 'native_unavailable' ? 'native_empty' : reason,
        reason,
      );
      return [];
    }
    try {
      const fallback = await fallbackFetch();
      recordTrendProviderOutcome(
        fallback.length ? 'fallback_available' : 'fallback_empty',
        reason,
      );
      return fallback;
    } catch (error: unknown) {
      recordTrendProviderOutcome('fallback_failed', 'provider_failed');
      this.loggerService.error(
        `${platform} Apify trend fallback failed`,
        error,
      );
      return [];
    }
  }

  private async fetchInstagramTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    const fallback = async () =>
      this.toTrendDataArray(
        await this.apifyService.getInstagramTrends({ limit: 20 }),
      );

    if (!organizationId || !brandId) {
      if (!allowApifyFallback) {
        recordTrendProviderOutcome('native_empty', 'native_unavailable');
        return [];
      }
      try {
        const trends = await fallback();
        recordTrendProviderOutcome(
          trends.length ? 'fallback_available' : 'fallback_empty',
          'native_unavailable',
        );
        return trends;
      } catch {
        recordTrendProviderOutcome('fallback_failed', 'provider_failed');
        return [];
      }
    }

    return this.fetchNativeFirst(
      'instagram',
      async () =>
        (await this.instagramService.getTrends(organizationId, brandId)).map(
          (trend) => ({
            growthRate: trend.growthRate,
            mentions: trend.mentions,
            metadata: {
              provider: 'instagram-graph-api',
              source: 'native-api',
            },
            platform: 'instagram',
            topic: trend.topic,
          }),
        ),
      fallback,
      allowApifyFallback,
    );
  }

  private async fetchTikTokTrends(
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): Promise<TrendData[]> {
    const fallback = async () =>
      this.toTrendDataArray(
        await this.apifyService.getTikTokTrends({ limit: 20 }),
      );

    if (!organizationId || !brandId) {
      if (!allowApifyFallback) {
        recordTrendProviderOutcome('native_empty', 'native_unavailable');
        return [];
      }
      try {
        const trends = await fallback();
        recordTrendProviderOutcome(
          trends.length ? 'fallback_available' : 'fallback_empty',
          'native_unavailable',
        );
        return trends;
      } catch {
        recordTrendProviderOutcome('fallback_failed', 'provider_failed');
        return [];
      }
    }

    return this.fetchNativeFirst(
      'tiktok',
      async () =>
        (await this.tiktokService.getTrends(organizationId, brandId)).map(
          (trend) => ({
            growthRate: trend.growthRate,
            mentions: trend.mentions,
            metadata: {
              ...trend.metadata,
              provider: 'tiktok-api',
              source: 'native-api',
            },
            platform: 'tiktok',
            topic: trend.topic,
          }),
        ),
      fallback,
      allowApifyFallback,
    );
  }

  private getLatestPinterestTrendValue(
    timeSeries: Record<string, number>,
  ): number {
    return (
      Object.entries(timeSeries)
        .sort(([first], [second]) => first.localeCompare(second))
        .at(-1)?.[1] ?? 0
    );
  }

  /**
   * Fetch trends from a specific platform using Apify or fallback services.
   *
   * Every result — global, organization-scoped, and empty — is cached. Apify
   * charges per actor run, so a cache miss is a bill, and an uncached failure
   * is a bill repeated on every caller.
   */
  async fetchPlatformTrends(
    platform: string,
    organizationId?: string,
    brandId?: string,
    options: TrendProviderExecutionOptions = {},
  ): Promise<TrendData[]> {
    const allowApifyFallback = options.allowApifyFallback !== false;
    const isGlobalRequest = !organizationId && !brandId;
    const cacheKey = this.buildPlatformTrendsCacheKey(
      platform,
      organizationId,
      brandId,
      allowApifyFallback,
    );

    const cached = await this.cacheService.get<TrendData[]>(cacheKey);
    if (cached) {
      this.loggerService.debug(`Cache hit for ${platform} trends`, {
        brandId,
        isGlobalRequest,
        organizationId,
      });
      return cached;
    }

    return withTrendRefreshAttempt(
      platform,
      'trends',
      isGlobalRequest ? 'global' : 'scoped',
      async () => {
        try {
          const platformHandlers: Record<string, () => Promise<TrendData[]>> = {
            instagram: () =>
              this.fetchInstagramTrends(
                organizationId,
                brandId,
                allowApifyFallback,
              ),
            linkedin: () => this.fetchLinkedInTrends(organizationId, brandId),
            pinterest: () =>
              this.fetchPinterestTrends(
                organizationId,
                brandId,
                allowApifyFallback,
              ),
            reddit: () =>
              this.fetchRedditTrends(
                organizationId,
                brandId,
                allowApifyFallback,
              ),
            tiktok: () =>
              this.fetchTikTokTrends(
                organizationId,
                brandId,
                allowApifyFallback,
              ),
            twitter: () =>
              this.fetchTwitterTrends(
                organizationId,
                brandId,
                allowApifyFallback,
              ),
            youtube: () =>
              this.fetchYoutubeTrends(
                allowApifyFallback,
                organizationId,
                brandId,
              ),
          };

          const handler = platformHandlers[platform];
          if (!handler) {
            this.loggerService.warn(`Unknown platform: ${platform}`);
            return [];
          }

          let trends: TrendData[];
          try {
            trends = await handler();
          } catch (error: unknown) {
            this.loggerService.error(
              `Failed to fetch trends for ${platform}`,
              error,
            );
            recordTrendProviderOutcome(
              allowApifyFallback && platform === 'twitter'
                ? 'fallback_failed'
                : 'native_failed',
              'provider_failed',
            );
            trends = [];
          }

          await this.cacheService.set(cacheKey, trends, {
            tags: this.buildPlatformTrendsCacheTags(
              platform,
              organizationId,
              brandId,
            ),
            ttl: this.resolvePlatformTrendsTtl(isGlobalRequest, trends.length),
          });

          return trends;
        } catch (error: unknown) {
          recordTrendProviderOutcome('native_failed', 'persistence_failed');
          this.loggerService.error(
            `Failed to cache trends for ${platform}`,
            error,
          );
          return [];
        }
      },
    );
  }

  /**
   * Personalized reads get their own key instead of skipping the cache, so an
   * authenticated dashboard refresh cannot trigger a fresh scrape per platform.
   */
  private buildPlatformTrendsCacheKey(
    platform: string,
    organizationId?: string,
    brandId?: string,
    allowApifyFallback = true,
  ): string {
    const policy = allowApifyFallback ? '' : ':native-only';
    if (!organizationId && !brandId) {
      return `${this.CACHE_PREFIX}:global:${platform}${policy}`;
    }

    return `${this.CACHE_PREFIX}:scoped:${platform}:${organizationId ?? 'none'}:${brandId ?? 'none'}${policy}`;
  }

  private buildPlatformTrendsCacheTags(
    platform: string,
    organizationId?: string,
    brandId?: string,
  ): string[] {
    const tags = ['trends', `trends:${platform}`];

    if (organizationId) {
      tags.push(`trends:org:${organizationId}`);
    }

    if (brandId) {
      tags.push(`trends:brand:${brandId}`);
    }

    return tags;
  }

  private resolvePlatformTrendsTtl(
    isGlobalRequest: boolean,
    trendCount: number,
  ): number {
    if (trendCount === 0) {
      return this.EMPTY_TRENDS_TTL_SECONDS;
    }

    return isGlobalRequest
      ? this.GLOBAL_TRENDS_TTL_SECONDS
      : this.PERSONALIZED_TRENDS_TTL_SECONDS;
  }

  /**
   * Fetch and cache trends for all platforms
   */
  async fetchAndCacheTrends(
    organizationId?: string,
    brandId?: string,
    calculateViralityScore?: (trend: TrendData) => number,
    options: TrendFetchBatchOptions = {},
  ): Promise<TrendEntity[]> {
    const captured = await captureTrendRefreshEvidence(
      async () => {
        const platforms = options.platforms ?? [
          'tiktok',
          'instagram',
          'linkedin',
          'twitter',
          'youtube',
          'reddit',
          'pinterest',
        ];
        const allTrends: TrendEntity[] = [];

        for (const platform of platforms) {
          let trendsData: TrendData[];
          try {
            trendsData = await this.fetchPlatformTrends(
              platform,
              organizationId,
              brandId,
              options,
            );
          } catch (error: unknown) {
            markTrendRefreshPersistenceFailed(platform, 'trends');
            this.loggerService.error(
              `Failed to cache trends for ${platform}`,
              error,
            );
            continue;
          }

          // Each row is saved on its own, so one malformed provider item
          // cannot drop the rest of the platform's batch.
          let savedRows = 0;
          for (const trendData of trendsData) {
            if (!trendData.topic?.trim() || !trendData.platform) {
              this.loggerService.warn(
                `Skipping ${platform} trend without a topic or platform`,
                { platform },
              );
              continue;
            }

            try {
              allTrends.push(
                await this.saveTrend(
                  trendData,
                  organizationId,
                  brandId,
                  calculateViralityScore,
                ),
              );
              savedRows += 1;
            } catch (error: unknown) {
              this.loggerService.error(
                `Failed to save ${platform} trend "${trendData.topic}"`,
                error,
              );
            }
          }

          if (trendsData.length > 0 && savedRows === 0) {
            markTrendRefreshPersistenceFailed(platform, 'trends');
          }
        }

        return allTrends;
      },
      (evidence) => this.refreshHealth.record(organizationId ?? null, evidence),
    );
    return captured.result;
  }

  private async saveTrend(
    trendData: TrendData,
    organizationId: string | undefined,
    brandId: string | undefined,
    calculateViralityScore?: (trend: TrendData) => number,
  ): Promise<TrendEntity> {
    const viralityScore = calculateViralityScore
      ? calculateViralityScore(trendData)
      : 0;

    // Determine if this trend requires authentication
    const requiresAuth = !!(organizationId && brandId);

    // Set TTL based on whether it's personalized or generic
    const ttlMinutes = requiresAuth
      ? this.PERSONALIZED_TREND_DOCUMENT_TTL_MINUTES
      : this.GLOBAL_TREND_DOCUMENT_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const savedTrend = await this.prisma.trend.create({
      data: {
        data: {
          growthRate: trendData.growthRate,
          mentions: trendData.mentions,
          metadata: trendData.metadata,
        } as Prisma.InputJsonValue,
        brandId: brandId || null,
        expiresAt,
        isCurrent: true,
        organizationId: organizationId?.trim() || null,
        platform: trendData.platform,
        requiresAuth,
        topic: trendData.topic,
        viralityScore,
      },
    });

    return new TrendEntity({
      ...savedTrend,
      ...(savedTrend.data as Record<string, unknown>),
    } as unknown as TrendDocument);
  }
}
