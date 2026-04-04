import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import type {
  AdsAdapterContext,
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
import { Injectable } from '@nestjs/common';

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
    params?: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
    },
  ): Promise<UnifiedInsights> {
    const dateRange = this.resolveDateRange(params);

    const insights = await this.tiktokAdsService.getCampaignInsights(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
    );

    if (insights.length === 0) {
      return this.emptyInsights();
    }

    // Aggregate all rows into a single insight
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;

    for (const row of insights) {
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

  async createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    const budgetMode = input.lifetimeBudget
      ? 'BUDGET_MODE_TOTAL'
      : 'BUDGET_MODE_DAY';

    const campaignId = await this.tiktokAdsService.createCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      {
        budget: input.dailyBudget || input.lifetimeBudget,
        budgetMode,
        campaignName: input.name,
        objectiveType: input.objective,
        status: input.status,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name,
      objective: input.objective,
      platform: this.platform,
      status: input.status || 'DISABLE',
    };
  }

  async updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign> {
    await this.tiktokAdsService.updateCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        budget: input.dailyBudget || input.lifetimeBudget,
        campaignName: input.name || '',
        status: input.status,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name || '',
      objective: '',
      platform: this.platform,
      status: input.status || '',
    };
  }

  async pauseCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
  ): Promise<void> {
    await this.tiktokAdsService.pauseCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
    );
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
    const dateRange = this.resolveDateRange({
      datePreset: params?.datePreset,
    });
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

  private resolveDateRange(params?: {
    datePreset?: string;
    timeRange?: { since: string; until: string };
  }): { startDate: string; endDate: string } {
    if (params?.timeRange) {
      return {
        endDate: params.timeRange.until,
        startDate: params.timeRange.since,
      };
    }

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() - 1);

    const presetDays: Record<string, number> = {
      last_7d: 7,
      last_14d: 14,
      last_30d: 30,
      last_90d: 90,
      today: 0,
      yesterday: 1,
    };

    const days = presetDays[params?.datePreset || 'last_30d'] ?? 30;
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    return {
      endDate: this.formatDate(end),
      startDate: this.formatDate(start),
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private emptyInsights(): UnifiedInsights {
    return {
      clicks: 0,
      cpc: 0,
      cpm: 0,
      ctr: 0,
      dateStart: '',
      dateStop: '',
      impressions: 0,
      platform: this.platform,
      spend: 0,
    };
  }
}
