import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
  resolveProviderCampaignStatus,
  resolveProviderPausedStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import { emptyUnifiedInsights } from '@api/services/ads-gateway/ads-insights-range.util';
import type {
  MetaInsightsData,
  MetaInsightsParams,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
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
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class MetaAdsAdapter implements IAdsAdapter {
  readonly platform = 'meta' as const;

  constructor(private readonly metaAdsService: MetaAdsService) {}

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
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const insights = await this.metaAdsService.getCampaignInsights(
      ctx.accessToken,
      campaignId,
      this.toMetaInsightsParams(params),
    );

    return this.toUnifiedInsights(insights);
  }

  async getAdSetInsights(
    ctx: AdsAdapterContext,
    adSetId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const insights = await this.metaAdsService.getAdSetInsights(
      ctx.accessToken,
      adSetId,
      this.toMetaInsightsParams(params),
    );

    return this.toUnifiedInsights(insights);
  }

  async getAdInsights(
    ctx: AdsAdapterContext,
    adId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const insights = await this.metaAdsService.getAdInsights(
      ctx.accessToken,
      adId,
      this.toMetaInsightsParams(params),
    );

    return this.toUnifiedInsights(insights);
  }

  async createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    this.assertPausedOnlyStatus(input.status);

    // Creation always sends the provider's paused value explicitly rather than
    // relying on a Meta-side default, so an omitted status cannot launch spend.
    const pausedStatus = resolveProviderPausedStatus(this.platform);

    const id = await this.metaAdsService.createCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      {
        dailyBudget: input.dailyBudget,
        lifetimeBudget: input.lifetimeBudget,
        name: input.name,
        objective: input.objective,
        specialAdCategories: input.specialAdCategories,
        status: pausedStatus,
      },
    );

    return {
      dailyBudget: input.dailyBudget,
      id,
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

    // An omitted status stays omitted so a budget-only edit never mutates the
    // campaign's live state on Meta.
    const providerStatus = resolveProviderCampaignStatus(
      this.platform,
      input.status,
    );

    await this.metaAdsService.updateCampaign(ctx.accessToken, campaignId, {
      dailyBudget: input.dailyBudget,
      lifetimeBudget: input.lifetimeBudget,
      name: input.name,
      status: providerStatus,
    });

    return {
      dailyBudget: input.dailyBudget,
      id: campaignId,
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
    const adSets = await this.metaAdsService.listAdSets(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
    );

    return adSets.map((adSet) => ({
      campaignId: adSet.campaignId ?? campaignId,
      id: adSet.id,
      name: adSet.name,
      platform: this.platform,
      status: adSet.status,
    }));
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
    ctx: AdsAdapterContext,
    adSetId?: string,
  ): Promise<UnifiedAd[]> {
    const ads = await this.metaAdsService.listAds(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
    );

    return ads.map((ad) => ({
      adSetId: ad.adSetId ?? adSetId ?? '',
      id: ad.id,
      name: ad.name,
      platform: this.platform,
      status: ad.status,
    }));
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

  private toMetaInsightsParams(params?: AdsInsightsParams): MetaInsightsParams {
    return {
      datePreset: params?.datePreset as MetaInsightsParams['datePreset'],
      timeRange: params?.timeRange,
    };
  }

  private toUnifiedInsights(rows: MetaInsightsData[]): UnifiedInsights {
    const row = rows[0];
    if (!row) {
      return emptyUnifiedInsights(this.platform);
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
}
