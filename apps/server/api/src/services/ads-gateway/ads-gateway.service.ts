import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { MetaAdsAdapter } from '@api/services/ads-gateway/adapters/meta-ads.adapter';
import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import type {
  AdsAdapterContext,
  AdsPlatform,
  CrossPlatformComparison,
  IAdsAdapter,
  UnifiedInsights,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AdsGatewayService {
  private readonly adapters: Map<AdsPlatform, IAdsAdapter>;

  constructor(
    private readonly metaAdapter: MetaAdsAdapter,
    private readonly googleAdapter: GoogleAdsAdapter,
    private readonly tiktokAdapter: TikTokAdsAdapter,
    private readonly logger: LoggerService,
  ) {
    this.adapters = new Map<AdsPlatform, IAdsAdapter>([
      ['meta', metaAdapter],
      ['google', googleAdapter],
      ['tiktok', tiktokAdapter],
    ]);
  }

  getAdapter(platform: AdsPlatform): IAdsAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
    return adapter;
  }

  async comparePlatforms(
    contexts: Array<{ platform: AdsPlatform; ctx: AdsAdapterContext }>,
    datePreset?: string,
  ): Promise<CrossPlatformComparison> {
    const results = await Promise.allSettled(
      contexts.map(async ({ platform, ctx }) => {
        const adapter = this.getAdapter(platform);
        const campaigns = await adapter.listCampaigns(ctx);

        let totalSpend = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalConversions = 0;
        let totalRoas = 0;
        let roasCount = 0;

        const insightResults = await Promise.allSettled(
          campaigns.map((c) =>
            adapter.getCampaignInsights(ctx, c.id, { datePreset }),
          ),
        );

        for (const result of insightResults) {
          if (result.status === 'fulfilled') {
            const insights: UnifiedInsights = result.value;
            totalSpend += insights.spend;
            totalImpressions += insights.impressions;
            totalClicks += insights.clicks;
            totalConversions += insights.conversions || 0;
            if (insights.roas !== undefined) {
              totalRoas += insights.roas;
              roasCount++;
            }
          }
        }

        return {
          avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
          avgCpm:
            totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
          avgCtr:
            totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
          avgRoas: roasCount > 0 ? totalRoas / roasCount : undefined,
          campaignCount: campaigns.length,
          platform,
          totalClicks,
          totalConversions: totalConversions || undefined,
          totalImpressions,
          totalSpend,
        };
      }),
    );

    const platforms: Array<{
      platform: AdsPlatform;
      totalSpend: number;
      totalImpressions: number;
      totalClicks: number;
      avgCtr: number;
      avgCpc: number;
      avgCpm: number;
      totalConversions?: number;
      avgRoas?: number;
      campaignCount: number;
    }> = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        platforms.push(result.value);
      }
    }

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          'AdsGatewayService.comparePlatforms: platform comparison failed',
          result.reason,
        );
      }
    }

    const bestPerformer = this.determineBestPerformer(platforms);

    return { bestPerformer, platforms };
  }

  private determineBestPerformer(
    platforms: Array<{
      platform: AdsPlatform;
      totalSpend: number;
      avgCtr: number;
      avgCpc: number;
      avgRoas?: number;
    }>,
  ): CrossPlatformComparison['bestPerformer'] {
    if (platforms.length === 0) {
      return {
        metric: 'none',
        platform: 'meta',
        reason: 'No platform data available',
      };
    }

    // Prioritize ROAS if available, otherwise CTR
    const withRoas = platforms.filter(
      (p) => p.avgRoas !== undefined && p.avgRoas > 0,
    );

    if (withRoas.length > 0) {
      const best = withRoas.reduce((a, b) =>
        (a.avgRoas || 0) > (b.avgRoas || 0) ? a : b,
      );
      return {
        metric: 'roas',
        platform: best.platform,
        reason: `Best ROAS at ${(best.avgRoas || 0).toFixed(2)}x`,
      };
    }

    const best = platforms.reduce((a, b) => (a.avgCtr > b.avgCtr ? a : b));
    return {
      metric: 'ctr',
      platform: best.platform,
      reason: `Best CTR at ${best.avgCtr.toFixed(2)}%`,
    };
  }
}
