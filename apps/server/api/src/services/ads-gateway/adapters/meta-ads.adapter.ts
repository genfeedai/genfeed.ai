import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
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
export class MetaAdsAdapter implements IAdsAdapter {
  readonly platform = 'meta' as const;

  constructor(
    private readonly metaAdsService: MetaAdsService,
    private readonly logger: LoggerService,
  ) {}

  async getAdAccounts(ctx: AdsAdapterContext): Promise<UnifiedAdAccount[]> {
    const accounts = await this.metaAdsService.getAdAccounts(ctx.accessToken);

    return accounts.map((account) => ({
      currency: account.currency,
      id: account.id,
      name: account.name,
      platform: this.platform,
      status: String(account.status),
      timezone: account.timezone,
    }));
  }

  async listCampaigns(ctx: AdsAdapterContext): Promise<UnifiedCampaign[]> {
    const campaigns = await this.metaAdsService.listCampaigns(
      ctx.accessToken,
      ctx.adAccountId,
    );

    return campaigns.map((c) => ({
      dailyBudget: c.dailyBudget,
      endDate: c.stopTime,
      id: c.id,
      lifetimeBudget: c.lifetimeBudget,
      name: c.name,
      objective: c.objective,
      platform: this.platform,
      startDate: c.startTime,
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
    const insights = await this.metaAdsService.getCampaignInsights(
      ctx.accessToken,
      campaignId,
      {
        datePreset: params?.datePreset as
          | 'today'
          | 'yesterday'
          | 'last_7d'
          | 'last_14d'
          | 'last_30d'
          | 'last_90d'
          | undefined,
        timeRange: params?.timeRange,
      },
    );

    const row = insights[0];
    if (!row) {
      return this.emptyInsights();
    }

    return {
      clicks: row.clicks,
      conversions: row.conversions,
      cpc: row.cpc,
      cpm: row.cpm,
      ctr: row.ctr,
      dateStart: row.dateStart,
      dateStop: row.dateStop,
      impressions: row.impressions,
      platform: this.platform,
      spend: row.spend,
    };
  }

  async createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    const id = await this.metaAdsService.createCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      {
        dailyBudget: input.dailyBudget,
        lifetimeBudget: input.lifetimeBudget,
        name: input.name,
        objective: input.objective,
        specialAdCategories: input.specialAdCategories,
        status: input.status,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name,
      objective: input.objective,
      platform: this.platform,
      status: input.status || 'PAUSED',
    };
  }

  async updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign> {
    await this.metaAdsService.updateCampaign(ctx.accessToken, campaignId, {
      dailyBudget: input.dailyBudget,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name,
      status: input.status,
    });

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
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
    await this.metaAdsService.pauseCampaign(ctx.accessToken, campaignId);
  }

  async listAdSets(
    _ctx: AdsAdapterContext,
    _campaignId: string,
  ): Promise<UnifiedAdSet[]> {
    // Meta does not expose a direct listAdSets via our current service
    // This would need MetaAdsService extension
    this.logger.warn('MetaAdsAdapter.listAdSets: not yet implemented');
    return [];
  }

  async createAdSet(
    ctx: AdsAdapterContext,
    input: CreateAdSetInput,
  ): Promise<UnifiedAdSet> {
    const targeting = input.targeting as Record<string, unknown>;
    const id = await this.metaAdsService.createAdSet(
      ctx.accessToken,
      ctx.adAccountId,
      {
        billingEvent: input.billingEvent || 'IMPRESSIONS',
        campaignId: input.campaignId,
        dailyBudget: input.dailyBudget,
        endTime: input.endTime,
        lifetimeBudget: input.lifetimeBudget,
        name: input.name,
        optimizationGoal: input.optimizationGoal || 'LINK_CLICKS',
        startTime: input.startTime,
        targeting: {
          ageMax: targeting.ageMax as number | undefined,
          ageMin: targeting.ageMin as number | undefined,
          customAudiences: targeting.customAudiences as
            | Array<{ id: string }>
            | undefined,
          genders: targeting.genders as number[] | undefined,
          geoLocations: targeting.geoLocations as
            | Record<string, unknown>
            | undefined,
          interests: targeting.interests as
            | Array<{ id: string; name: string }>
            | undefined,
        },
      },
    );

    return {
      campaignId: input.campaignId,
      dailyBudget: input.dailyBudget,
      id,
      name: input.name,
      optimizationGoal: input.optimizationGoal,
      platform: this.platform,
      status: 'PAUSED',
      targeting: input.targeting,
    };
  }

  async listAds(
    _ctx: AdsAdapterContext,
    _adSetId?: string,
  ): Promise<UnifiedAd[]> {
    this.logger.warn('MetaAdsAdapter.listAds: not yet implemented');
    return [];
  }

  async createAd(
    ctx: AdsAdapterContext,
    input: CreateAdInput,
  ): Promise<UnifiedAd> {
    const id = await this.metaAdsService.createAd(
      ctx.accessToken,
      ctx.adAccountId,
      {
        adSetId: input.adSetId,
        creative: {
          body: input.creative.body,
          callToAction: input.creative.callToAction,
          imageHash: input.creative.imageHash,
          linkUrl: input.creative.linkUrl,
          title: input.creative.title,
          videoId: input.creative.videoId,
        },
        name: input.name,
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
      status: 'PAUSED',
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
    const metric = params?.metric || 'ctr';
    const performers = await this.metaAdsService.getTopPerformers(
      ctx.accessToken,
      ctx.adAccountId,
      metric,
      params?.limit,
    );

    return performers.map((p) => ({
      id: p.id,
      insights: {
        clicks: p.insights.clicks,
        conversions: p.insights.conversions,
        cpc: p.insights.cpc,
        cpm: p.insights.cpm,
        ctr: p.insights.ctr,
        dateStart: p.insights.dateStart,
        dateStop: p.insights.dateStop,
        impressions: p.insights.impressions,
        platform: this.platform,
        spend: p.insights.spend,
      },
      metric: p.metric,
      name: p.name,
      value: p.value,
    }));
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
