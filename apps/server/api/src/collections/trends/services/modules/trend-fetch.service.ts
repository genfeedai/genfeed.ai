import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  ApifyTrendItem,
  TrendData,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  Trend,
  type TrendDocument,
} from '@api/collections/trends/schemas/trend.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { GrokTrendData } from '@api/services/integrations/xai/dto/grok-trends.dto';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class TrendFetchService {
  private readonly GLOBAL_TRENDS_TTL_SECONDS = 1800; // 30 minutes
  private readonly CACHE_PREFIX = 'trends';
  private readonly GLOBAL_TREND_DOCUMENT_TTL_MINUTES = 48 * 60;
  private readonly PERSONALIZED_TREND_DOCUMENT_TTL_MINUTES = 10;
  private readonly YEAR_TOKEN_PATTERN = /\b(20\d{2})\b/;
  private readonly HISTORICAL_CONTEXT_PATTERN =
    /\b(completed|ended|highlights?\s+from|opening ceremony from|closing ceremony from|recap|throwback|archive|from\s+20\d{2})\b/i;
  private readonly CURRENT_TRIGGER_PATTERN =
    /\b(today|tonight|this week|now|currently|new|latest|ongoing|live|breaking|just announced|released|launch|current)\b/i;

  constructor(
    @InjectModel(Trend.name, DB_CONNECTIONS.CLOUD)
    private trendModel: Model<TrendDocument>,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly apifyService: ApifyService,
    private readonly linkedinService: LinkedInService,
    private readonly xaiService: XaiService,
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
   * Fetch Twitter trends with Grok fallback to Apify
   */
  async fetchTwitterTrends(): Promise<TrendData[]> {
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

      this.loggerService.warn(
        'All Grok Twitter trends were rejected as stale, falling back to Apify',
      );
    } catch {
      const apifyTrends = await this.apifyService.getTwitterTrends({
        limit: 20,
      });
      return this.toTrendDataArray(apifyTrends);
    }

    const apifyTrends = await this.apifyService.getTwitterTrends({
      limit: 20,
    });
    return this.toTrendDataArray(apifyTrends);
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

    return linkedinTopics.map((topic) => ({
      growthRate: topic.growthRate,
      mentions: topic.mentions,
      metadata: topic.metadata,
      platform: 'linkedin',
      topic: topic.topic,
    }));
  }

  /**
   * Fetch trends from a specific platform using Apify or fallback services
   * Uses Redis caching for global trends (30 min TTL)
   */
  async fetchPlatformTrends(
    platform: string,
    organizationId?: string,
    brandId?: string,
  ): Promise<TrendData[]> {
    const isGlobalRequest = !organizationId && !brandId;
    const cacheKey = `${this.CACHE_PREFIX}:global:${platform}`;

    if (isGlobalRequest) {
      const cached = await this.cacheService.get<TrendData[]>(cacheKey);
      if (cached) {
        this.loggerService.debug(`Cache hit for global ${platform} trends`);
        return cached;
      }
    }

    try {
      const platformHandlers: Record<string, () => Promise<TrendData[]>> = {
        instagram: async () =>
          this.toTrendDataArray(
            await this.apifyService.getInstagramTrends({ limit: 20 }),
          ),
        linkedin: () => this.fetchLinkedInTrends(organizationId, brandId),
        pinterest: async () =>
          this.toTrendDataArray(
            await this.apifyService.getPinterestTrends({ limit: 20 }),
          ),
        reddit: async () =>
          this.toTrendDataArray(
            await this.apifyService.getRedditTrends({ limit: 20 }),
          ),
        tiktok: async () =>
          this.toTrendDataArray(
            await this.apifyService.getTikTokTrends({ limit: 20 }),
          ),
        twitter: () => this.fetchTwitterTrends(),
        youtube: async () =>
          this.toTrendDataArray(
            await this.apifyService.getYouTubeTrends({ limit: 20 }),
          ),
      };

      const handler = platformHandlers[platform];
      if (!handler) {
        this.loggerService.warn(`Unknown platform: ${platform}`);
        return [];
      }

      const trends = await handler();

      if (isGlobalRequest && trends.length > 0) {
        await this.cacheService.set(cacheKey, trends, {
          tags: ['trends', `trends:${platform}`],
          ttl: this.GLOBAL_TRENDS_TTL_SECONDS,
        });
      }

      return trends;
    } catch (error: unknown) {
      this.loggerService.error(`Failed to fetch trends for ${platform}`, error);
      return [];
    }
  }

  /**
   * Fetch and cache trends for all platforms
   */
  async fetchAndCacheTrends(
    organizationId?: string,
    brandId?: string,
    calculateViralityScore?: (trend: TrendData) => number,
  ): Promise<TrendEntity[]> {
    const platforms = [
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
      try {
        const trendsData = await this.fetchPlatformTrends(
          platform,
          organizationId,
          brandId,
        );

        for (const trendData of trendsData) {
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

          const trend = new this.trendModel({
            ...trendData,
            brand: brandId || null,
            expiresAt,
            isCurrent: true,
            organization: organizationId || null,
            requiresAuth,
            viralityScore,
          });

          const savedTrend = await trend.save();
          allTrends.push(new TrendEntity(savedTrend.toObject()));
        }
      } catch (error: unknown) {
        this.loggerService.error(
          `Failed to cache trends for ${platform}`,
          error,
        );
      }
    }

    return allTrends;
  }
}
