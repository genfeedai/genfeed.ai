import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
  resolveProviderCampaignStatus,
  resolveProviderPausedStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import {
  type AdsInsightsDateRange,
  emptyUnifiedInsights,
  resolveAdsInsightsDateRange,
} from '@api/services/ads-gateway/ads-insights-range.util';
import type { TikTokInsightsData } from '@api/services/integrations/tiktok-ads/interfaces/tiktok-ads.interface';
import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import type {
  AdsAdapterContext,
  AdsInsightsParams,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  IAdsAdapter,
  UnifiedAd,
  UnifiedAdAccount,
  UnifiedAdSet,
  UnifiedCampaign,
  UnifiedInsights,
  UpdateCampaignInput,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class TikTokAdsAdapter implements IAdsAdapter {
  readonly platform = 'tiktok' as const;

  constructor(
    private readonly tiktokAdsService: TikTokAdsService,
    private readonly logger: LoggerService,
  ) {}

  async getAdAccounts(ctx: AdsAdapterContext): Promise<UnifiedAdAccount[]> {
    const accounts = await this.tiktokAdsService.getAdAccounts(ctx.accessToken);

    return accounts.map((a) => ({
      currency: a.currency,
      id: a.advertiserId,
      name: a.advertiserName,
      platform: this.platform,
      status: a.status,
      timezone: a.timezone,
    }));
  }

  async listCampaigns(ctx: AdsAdapterContext): Promise<UnifiedCampaign[]> {
    const campaigns = await this.tiktokAdsService.listCampaigns(
      ctx.accessToken,
      ctx.adAccountId,
    );

    return campaigns.map((c) => ({
      dailyBudget: c.budgetMode === 'BUDGET_MODE_DAY' ? c.budget : undefined,
      id: c.campaignId,
      lifetimeBudget:
        c.budgetMode === 'BUDGET_MODE_TOTAL' ? c.budget : undefined,
      name: c.campaignName,
      objective: c.objective,
      platform: this.platform,
      startDate: c.createTime,
      status: c.status,
    }));
  }

  async getCampaignInsights(
    ctx: AdsAdapterContext,
    campaignId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const insights = await this.tiktokAdsService.getCampaignInsights(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
    );

    return this.aggregateInsights(insights, dateRange);
  }

  async getAdSetInsights(
    ctx: AdsAdapterContext,
    adSetId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const insights = await this.tiktokAdsService.getAdGroupInsights(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
      {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
    );

    return this.aggregateInsights(insights, dateRange);
  }

  async getAdInsights(
    ctx: AdsAdapterContext,
    adId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const insights = await this.tiktokAdsService.getAdInsights(
      ctx.accessToken,
      ctx.adAccountId,
      adId,
      {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
    );

    return this.aggregateInsights(insights, dateRange);
  }

  async createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    this.assertPausedOnlyStatus(input.status);

    const budgetMode = input.lifetimeBudget
      ? 'BUDGET_MODE_TOTAL'
      : 'BUDGET_MODE_DAY';

    // TikTok has no PAUSED operation status — its paused value is `DISABLE`,
    // and it is sent explicitly rather than left to a provider default.
    const pausedStatus = resolveProviderPausedStatus(this.platform);

    const campaignId = await this.tiktokAdsService.createCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      {
        budget: input.dailyBudget || input.lifetimeBudget,
        budgetMode,
        campaignName: input.name,
        objectiveType: input.objective,
        status: pausedStatus,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name,
      objective: input.objective,
      platform: this.platform,
      status: pausedStatus,
    };
  }

  async updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign> {
    this.assertPausedOnlyStatus(input.status);

    const providerStatus = resolveProviderCampaignStatus(
      this.platform,
      input.status,
    );

    await this.tiktokAdsService.updateCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        budget: input.dailyBudget || input.lifetimeBudget,
        campaignName: input.name || '',
        status: providerStatus,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name || '',
      objective: '',
      platform: this.platform,
      status: providerStatus || '',
    };
  }

  /**
   * Direct adapter callers bypass the gateway controller, so every write path
   * re-asserts the paused-only contract before touching the provider.
   */
  private assertPausedOnlyStatus(status: unknown): void {
    if (!isAcceptedCampaignStatus(status)) {
      throw new BadRequestException(INVALID_CAMPAIGN_STATUS_MESSAGE);
    }
  }

  async listAdSets(
    ctx: AdsAdapterContext,
    campaignId: string,
  ): Promise<UnifiedAdSet[]> {
    const response = await this.tiktokAdsService.listAdGroups(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
    );

    return (response.list || []).map((ag) => ({
      campaignId: ag.campaign_id,
      dailyBudget:
        ag.budget_mode === 'BUDGET_MODE_DAY'
          ? ag.budget / 1_000_000
          : undefined,
      id: ag.adgroup_id,
      name: ag.adgroup_name,
      optimizationGoal: ag.optimization_goal,
      platform: this.platform,
      status: ag.status,
    }));
  }

  async createAdSet(
    ctx: AdsAdapterContext,
    input: CreateAdSetInput,
  ): Promise<UnifiedAdSet> {
    const id = await this.tiktokAdsService.createAdGroup(
      ctx.accessToken,
      ctx.adAccountId,
      {
        adgroupName: input.name,
        billingEvent: input.billingEvent || 'CPC',
        budget: input.dailyBudget || input.lifetimeBudget || 0,
        budgetMode: input.lifetimeBudget
          ? 'BUDGET_MODE_TOTAL'
          : 'BUDGET_MODE_DAY',
        campaignId: input.campaignId,
        optimizationGoal: input.optimizationGoal || 'CLICK',
        scheduleEndTime: input.endTime,
        scheduleStartTime: input.startTime,
        targeting: input.targeting,
      },
    );

    return {
      campaignId: input.campaignId,
      dailyBudget: input.dailyBudget,
      id,
      name: input.name,
      optimizationGoal: input.optimizationGoal,
      platform: this.platform,
      status: 'DISABLE',
      targeting: input.targeting,
    };
  }

  async listAds(
    ctx: AdsAdapterContext,
    adSetId?: string,
  ): Promise<UnifiedAd[]> {
    const response = await this.tiktokAdsService.listAds(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
    );

    return (response.list || []).map((ad) => ({
      adSetId: ad.adgroup_id,
      creative: {
        body: ad.ad_text,
        callToAction: ad.call_to_action,
        linkUrl: ad.landing_page_url,
        videoId: ad.video_id,
      },
      id: ad.ad_id,
      name: ad.ad_name,
      platform: this.platform,
      status: ad.status,
    }));
  }

  async createAd(
    ctx: AdsAdapterContext,
    input: CreateAdInput,
  ): Promise<UnifiedAd> {
    const id = await this.tiktokAdsService.createAd(
      ctx.accessToken,
      ctx.adAccountId,
      {
        adgroupId: input.adSetId,
        adName: input.name,
        adText: input.creative.body,
        callToAction: input.creative.callToAction,
        landingPageUrl: input.creative.linkUrl,
        videoId: input.creative.videoId,
      },
    );

    return {
      adSetId: input.adSetId,
      creative: {
        body: input.creative.body,
        callToAction: input.creative.callToAction,
        linkUrl: input.creative.linkUrl,
        title: input.creative.title,
        videoId: input.creative.videoId,
      },
      id,
      name: input.name,
      platform: this.platform,
      status: 'DISABLE',
    };
  }

  async getTopPerformers(
    ctx: AdsAdapterContext,
    params?: { metric?: string; limit?: number; datePreset?: string },
  ): Promise<
    Array<{
      id: string;
      name: string;
      metric: string;
      value: number;
      insights: UnifiedInsights;
    }>
  > {
    const dateRange = resolveAdsInsightsDateRange(
      { datePreset: params?.datePreset },
      { defaultPreset: 'last_30d' },
    );
    const metric = params?.metric || 'ctr';

    const reportData = await this.tiktokAdsService.getReporting(
      ctx.accessToken,
      ctx.adAccountId,
      {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
    );

    return reportData
      .map((row) => {
        const metricMap: Record<string, number> = {
          clicks: row.clicks,
          conversions: row.conversions || 0,
          cpc: row.cpc,
          cpm: row.cpm,
          ctr: row.ctr,
          impressions: row.impressions,
          spend: row.spend,
        };

        return {
          id: row.statTimeDay,
          insights: {
            clicks: row.clicks,
            conversions: row.conversions,
            cpc: row.cpc,
            cpm: row.cpm,
            ctr: row.ctr,
            dateStart: row.statTimeDay,
            dateStop: row.statTimeDay,
            impressions: row.impressions,
            platform: this.platform,
            spend: row.spend,
          },
          metric,
          name: row.statTimeDay,
          value: metricMap[metric] || 0,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, params?.limit || 10);
  }

  /**
   * TikTok reports one row per `stat_time_day`, so every level is collapsed
   * into a single window total. Ratio metrics are recomputed from the totals
   * rather than averaged, which would weight days equally regardless of volume.
   */
  private aggregateInsights(
    rows: TikTokInsightsData[],
    dateRange: AdsInsightsDateRange,
  ): UnifiedInsights {
    if (rows.length === 0) {
      return emptyUnifiedInsights(this.platform);
    }

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;

    for (const row of rows) {
      totalSpend += row.spend;
      totalImpressions += row.impressions;
      totalClicks += row.clicks;
      totalConversions += row.conversions || 0;
    }

    return {
      clicks: totalClicks,
      conversions: totalConversions || undefined,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : undefined,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      dateStart: dateRange.startDate,
      dateStop: dateRange.endDate,
      impressions: totalImpressions,
      platform: this.platform,
      spend: totalSpend,
    };
  }
}
