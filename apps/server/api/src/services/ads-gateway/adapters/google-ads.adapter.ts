import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
  resolveProviderCampaignStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import {
  type AdsInsightsDateRange,
  emptyUnifiedInsights,
  resolveAdsInsightsDateRange,
} from '@api/services/ads-gateway/ads-insights-range.util';
import type {
  GoogleAdsAdGroupInsights,
  GoogleAdsAdInsights,
} from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
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
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const MICROS_DIVISOR = 1_000_000;

@Injectable()
export class GoogleAdsAdapter implements IAdsAdapter {
  readonly platform = 'google' as const;

  constructor(
    private readonly googleAdsService: GoogleAdsService,
    private readonly logger: LoggerService,
  ) {}

  async getAdAccounts(ctx: AdsAdapterContext): Promise<UnifiedAdAccount[]> {
    const customers = await this.googleAdsService.listAccessibleCustomers(
      ctx.accessToken,
    );

    return customers.map((c) => ({
      currency: c.currencyCode,
      id: c.id,
      name: c.descriptiveName,
      platform: this.platform,
      status: c.isManager ? 'MANAGER' : 'ACTIVE',
      timezone: c.timeZone,
    }));
  }

  async listCampaigns(ctx: AdsAdapterContext): Promise<UnifiedCampaign[]> {
    const campaigns = await this.googleAdsService.listCampaigns(
      ctx.accessToken,
      ctx.adAccountId,
      undefined,
      ctx.loginCustomerId,
    );

    return campaigns.map((c) => ({
      dailyBudget: c.budgetAmountMicros
        ? Number(c.budgetAmountMicros) / MICROS_DIVISOR
        : undefined,
      endDate: c.endDate,
      id: c.id,
      name: c.name,
      objective: c.advertisingChannelType,
      platform: this.platform,
      startDate: c.startDate,
      status: c.status,
    }));
  }

  async getCampaignInsights(
    ctx: AdsAdapterContext,
    campaignId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params);

    const metrics = await this.googleAdsService.getCampaignMetrics(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      dateRange ? { dateRange } : undefined,
      ctx.loginCustomerId,
    );

    const row = metrics[0];
    if (!row) {
      return emptyUnifiedInsights(this.platform);
    }

    const spend = row.costMicros / MICROS_DIVISOR;

    return {
      clicks: row.clicks,
      conversions: row.conversions,
      cpc: row.averageCpc / MICROS_DIVISOR,
      cpm: row.averageCpm / MICROS_DIVISOR,
      ctr: row.ctr,
      dateStart: dateRange?.startDate || '',
      dateStop: dateRange?.endDate || '',
      impressions: row.impressions,
      platform: this.platform,
      revenue: row.conversionsValue,
      roas:
        spend > 0 && row.conversionsValue > 0
          ? row.conversionsValue / spend
          : undefined,
      spend,
    };
  }

  async getAdSetInsights(
    ctx: AdsAdapterContext,
    adSetId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params);

    const rows = await this.googleAdsService.getAdGroupInsights(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
      dateRange ? { dateRange } : undefined,
      ctx.loginCustomerId,
    );

    return this.toUnifiedInsights(rows[0], dateRange);
  }

  async getAdInsights(
    ctx: AdsAdapterContext,
    adId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params);

    const rows = await this.googleAdsService.getAdInsights(
      ctx.accessToken,
      ctx.adAccountId,
      adId,
      dateRange ? { dateRange } : undefined,
      ctx.loginCustomerId,
    );

    return this.toUnifiedInsights(rows[0], dateRange);
  }

  async createCampaign(
    _ctx: AdsAdapterContext,
    _input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    this.logger.warn(
      'GoogleAdsAdapter.createCampaign: unsupported because campaign creation requires coordinated budget + ad group + ad setup flow',
    );

    throw new BadRequestException(
      'Google Ads does not support this unified createCampaign operation. Campaign setup must include budget, bidding strategy, and ad group configuration in a coordinated workflow.',
    );
  }

  async updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign> {
    this.assertPausedOnlyStatus(input.status);

    // Omitted stays omitted — a budget rename must not flip a Google campaign's
    // serving state as a side effect.
    const providerStatus = resolveProviderCampaignStatus(
      this.platform,
      input.status,
    );

    await this.googleAdsService.updateCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        dailyBudget: input.dailyBudget,
        name: input.name,
        status: providerStatus,
      },
      ctx.loginCustomerId,
    );

    const updatedCampaign = await this.googleAdsService.getCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      ctx.loginCustomerId,
    );

    return {
      dailyBudget: updatedCampaign?.budgetAmountMicros
        ? Number(updatedCampaign.budgetAmountMicros) / MICROS_DIVISOR
        : input.dailyBudget,
      endDate: updatedCampaign?.endDate,
      id: campaignId,
      name: updatedCampaign?.name || input.name || '',
      objective: updatedCampaign?.advertisingChannelType || '',
      platform: this.platform,
      startDate: updatedCampaign?.startDate,
      status: updatedCampaign?.status || providerStatus || '',
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
    const adGroups = await this.googleAdsService.listAdGroups(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      ctx.loginCustomerId,
    );

    return adGroups.map((group) => ({
      campaignId: group.campaignId,
      dailyBudget: group.cpcBidMicros
        ? Number(group.cpcBidMicros) / MICROS_DIVISOR
        : undefined,
      id: group.id,
      name: group.name,
      platform: this.platform,
      status: group.status,
    }));
  }

  async createAdSet(
    ctx: AdsAdapterContext,
    input: CreateAdSetInput,
  ): Promise<UnifiedAdSet> {
    const adGroup = await this.googleAdsService.createAdGroup(
      ctx.accessToken,
      ctx.adAccountId,
      {
        campaignId: input.campaignId,
        cpcBidMicros: input.dailyBudget
          ? Math.round(input.dailyBudget * MICROS_DIVISOR)
          : undefined,
        name: input.name,
      },
      ctx.loginCustomerId,
    );

    return {
      campaignId: input.campaignId,
      dailyBudget: adGroup.cpcBidMicros
        ? Number(adGroup.cpcBidMicros) / MICROS_DIVISOR
        : input.dailyBudget,
      id: adGroup.id,
      name: adGroup.name,
      optimizationGoal: input.optimizationGoal,
      platform: this.platform,
      status: adGroup.status,
      targeting: input.targeting,
    };
  }

  async listAds(
    ctx: AdsAdapterContext,
    adSetId?: string,
  ): Promise<UnifiedAd[]> {
    const ads = await this.googleAdsService.listAds(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
      ctx.loginCustomerId,
    );

    return ads.map((ad) => ({
      adSetId: ad.adGroupId,
      creative: {
        body: ad.descriptions?.[0],
        linkUrl: ad.finalUrls?.[0],
        title: ad.headlines?.[0],
      },
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
    const firstHeadline = input.creative.title || input.name;
    const firstDescription = input.creative.body || 'Learn more';

    const createdAd = await this.googleAdsService.createResponsiveSearchAd(
      ctx.accessToken,
      ctx.adAccountId,
      {
        adGroupId: input.adSetId,
        descriptions: [firstDescription],
        finalUrl: input.creative.linkUrl,
        headlines: [firstHeadline],
        name: input.name,
      },
      ctx.loginCustomerId,
    );

    return {
      adSetId: createdAd.adGroupId,
      creative: {
        body: createdAd.descriptions?.[0],
        linkUrl: createdAd.finalUrls?.[0],
        title: createdAd.headlines?.[0],
      },
      id: createdAd.id,
      name: createdAd.name,
      platform: this.platform,
      status: createdAd.status,
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
    const campaigns = await this.googleAdsService.listCampaigns(
      ctx.accessToken,
      ctx.adAccountId,
      undefined,
      ctx.loginCustomerId,
    );

    const dateRange = resolveAdsInsightsDateRange({
      datePreset: params?.datePreset,
    });
    const metric = params?.metric || 'ctr';

    const performers = await Promise.all(
      campaigns.map(async (campaign) => {
        const metrics = await this.googleAdsService.getCampaignMetrics(
          ctx.accessToken,
          ctx.adAccountId,
          campaign.id,
          dateRange ? { dateRange, limit: 1 } : { limit: 1 },
          ctx.loginCustomerId,
        );

        const row = metrics[0];
        const spend = row ? row.costMicros / MICROS_DIVISOR : 0;
        const insights: UnifiedInsights = row
          ? {
              clicks: row.clicks,
              conversions: row.conversions,
              cpc: row.averageCpc / MICROS_DIVISOR,
              cpm: row.averageCpm / MICROS_DIVISOR,
              ctr: row.ctr,
              dateStart: dateRange?.startDate || '',
              dateStop: dateRange?.endDate || '',
              impressions: row.impressions,
              platform: this.platform,
              revenue: row.conversionsValue,
              roas:
                spend > 0 && row.conversionsValue > 0
                  ? row.conversionsValue / spend
                  : undefined,
              spend,
            }
          : emptyUnifiedInsights(this.platform);

        const value = this.resolveMetricValue(metric, insights);

        return {
          id: campaign.id,
          insights,
          metric,
          name: campaign.name,
          value,
        };
      }),
    );

    return performers
      .sort((a, b) => b.value - a.value)
      .slice(0, params?.limit || 10);
  }

  /**
   * Ad group and ad level GAQL reports share a metric set that omits
   * `metrics.average_cpm` and `metrics.conversions_value`, so CPM is derived
   * from spend over impressions (Google's own definition) and revenue/ROAS are
   * left undefined rather than guessed.
   */
  private toUnifiedInsights(
    row: GoogleAdsAdGroupInsights | GoogleAdsAdInsights | undefined,
    dateRange?: AdsInsightsDateRange,
  ): UnifiedInsights {
    if (!row) {
      return emptyUnifiedInsights(this.platform);
    }

    const spend = row.costMicros / MICROS_DIVISOR;

    return {
      clicks: row.clicks,
      conversions: row.conversions,
      cpa: row.conversions > 0 ? spend / row.conversions : undefined,
      cpc: row.averageCpc / MICROS_DIVISOR,
      cpm: row.impressions > 0 ? (spend / row.impressions) * 1000 : 0,
      ctr: row.ctr,
      dateStart: dateRange?.startDate || '',
      dateStop: dateRange?.endDate || '',
      impressions: row.impressions,
      platform: this.platform,
      spend,
    };
  }

  private resolveMetricValue(
    metric: string,
    insights: UnifiedInsights,
  ): number {
    const metricMap: Record<string, number> = {
      clicks: insights.clicks,
      conversions: insights.conversions || 0,
      cpc: insights.cpc,
      cpm: insights.cpm,
      ctr: insights.ctr,
      impressions: insights.impressions,
      revenue: insights.revenue || 0,
      roas: insights.roas || 0,
      spend: insights.spend,
    };

    return metricMap[metric] || 0;
  }
}
