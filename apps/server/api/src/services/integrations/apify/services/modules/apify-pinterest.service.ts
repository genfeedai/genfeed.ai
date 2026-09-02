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

  constructor(private readonly baseService: ApifyBaseService) {}

  /**
   * Get Pinterest trending pins
   */
  async getPinterestTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const input = {
        maxItems: options?.limit || 20,
        searchTerms: ['trending', 'viral', 'popular'],
      };

      const rawPins = await this.baseService.runActor<ApifyPinterestPin>(
        this.baseService.ACTORS.PINTEREST_SCRAPER,
        input,
      );

      return this.normalizePinterestTrends(rawPins);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getPinterestTrends failed`,
        error,
      );
      return [];
    }
  }

  private normalizePinterestTrends(
    pins: ApifyPinterestPin[],
  ): ApifyTrendData[] {
    return pins.map((pin) => ({
      growthRate: this.baseService.calculateGrowthRate(pin.repinCount || 0),
      mentions: pin.repinCount || 0,
      metadata: {
        commentCount: pin.commentCount,
        hashtags: [],
        repinCount: pin.repinCount,
        source: 'apify' as const,
        thumbnailUrl: pin.imageUrl,
        trendType: 'topic' as const,
        urls: pin.link ? [pin.link] : [],
      },
      platform: 'pinterest',
      topic: pin.title || pin.description?.substring(0, 50) || 'Trending Pin',
      viralityScore: this.baseService.calculateViralityScore(
        pin.repinCount || 0,
        pin.commentCount || 0,
      ),
    }));
  }
}
