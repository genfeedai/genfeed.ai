import type {
  ApifyPinterestPin,
  ApifyTrendData,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyPinterestService
 *
 * Handles all Pinterest-related Apify scraping operations:
 * trends and pin normalization.
 */
@Injectable()
export class ApifyPinterestService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly TREND_SEED_QUERIES = ['trending', 'viral', 'popular'];

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get Pinterest trending pins
   */
  async getPinterestTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const requestedLimit = Math.max(1, options?.limit || 20);
      const input = {
        // The actor applies `limit` per query, so split the total across seeds.
        limit: Math.ceil(requestedLimit / this.TREND_SEED_QUERIES.length),
        queries: this.TREND_SEED_QUERIES,
        type: 'all-pins',
      };

      const rawPins = await this.baseService.runActor<ApifyPinterestPin>(
        this.baseService.ACTORS.PINTEREST_SCRAPER,
        input,
      );

      return this.normalizePinterestTrends(rawPins).slice(0, requestedLimit);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getPinterestTrends failed`,
        error,
      );
      throw error;
    }
  }

  private normalizePinterestTrends(
    pins: ApifyPinterestPin[],
  ): ApifyTrendData[] {
    // The seed queries overlap, so the same pin can come back more than once.
    const seenPinIds = new Set<string>();
    return pins
      .filter((pin) => {
        if (pin.pin?.is_promoted || seenPinIds.has(pin.id)) {
          return false;
        }
        seenPinIds.add(pin.id);
        return true;
      })
      .map((pin) => {
        const repinCount = pin.pin?.repin_count || 0;
        const commentCount = pin.pin?.comment_count || 0;
        const images = pin.media?.images;
        const title = pin.title || pin.pin?.title;
        return {
          growthRate: this.baseService.calculateGrowthRate(repinCount),
          mentions: repinCount,
          metadata: {
            commentCount,
            hashtags: [],
            repinCount,
            source: 'apify' as const,
            thumbnailUrl:
              images?.large?.url ??
              images?.medium?.url ??
              images?.original?.url,
            trendType: 'topic' as const,
            urls: pin.url ? [pin.url] : [],
          },
          platform: 'pinterest',
          topic:
            title || pin.pin?.description?.substring(0, 50) || 'Trending Pin',
          viralityScore: this.baseService.calculateViralityScore(
            repinCount,
            commentCount,
          ),
        };
      });
  }
}
