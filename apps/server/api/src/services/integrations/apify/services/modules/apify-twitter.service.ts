import type {
  ApifyTrendData,
  ApifyTwitterTrend,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const LEADING_HASH_PATTERN = /^#/;

/**
 * ApifyTwitterService
 *
 * Twitter/X trends through Apify. Every other X read goes through the
 * official X API (`TwitterService`).
 */
@Traced()
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
        locations: [options?.region || 'US'],
        maxTrendsPerLocation: options?.limit || 20,
      };

      const rawTrends = await this.baseService.runActor<ApifyTwitterTrend>(
        this.baseService.ACTORS.TWITTER_TRENDS,
        input,
      );

      return this.normalizeTwitterTrends(rawTrends);
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.getTwitterTrends failed`,
        error,
      );
      throw error;
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
            hashtags: isHashtag
              ? [trend.name.replace(LEADING_HASH_PATTERN, '')]
              : [],
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
}
