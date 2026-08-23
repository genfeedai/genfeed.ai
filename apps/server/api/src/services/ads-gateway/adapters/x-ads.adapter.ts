import {
  type AdsInsightsDateRange,
  emptyUnifiedInsights,
  resolveAdsInsightsDateRange,
} from '@api/services/ads-gateway/ads-insights-range.util';
import type {
  XAdsCampaign,
  XAdsEntityStatus,
  XAdsInsightsRow,
  XAdsLineItem,
  XAdsPromotedTweet,
} from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
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

const X_ADS_ENTITY_STATUSES: readonly XAdsEntityStatus[] = [
  'ACTIVE',
  'PAUSED',
  'DRAFT',
];
const X_ADS_OBJECTIVES = [
  'APP_ENGAGEMENTS',
  'APP_INSTALLS',
  'REACH',
  'FOLLOWERS',
  'ENGAGEMENTS',
  'VIDEO_VIEWS',
  'PREROLL_VIEWS',
  'WEBSITE_CLICKS',
] as const;
type XAdsObjective = (typeof X_ADS_OBJECTIVES)[number];

function isXAdsEntityStatus(value: string): value is XAdsEntityStatus {
  return (X_ADS_ENTITY_STATUSES as readonly string[]).includes(value);
}

function isXAdsObjective(value: string): value is XAdsObjective {
  return (X_ADS_OBJECTIVES as readonly string[]).includes(value);
}

/**
 * X Ads maps its `campaign` / `line_item` / `promoted_tweet` hierarchy onto
 * the unified `campaign` / `ad set` / `ad` hierarchy: a line item is the
 * unified ad set, a promoted tweet is the unified ad.
 *
 * X Ads campaigns and line items always launch `PAUSED` regardless of caller
 * intent — this adapter is the paused-campaign-draft entry point for the
 * approved-paid-remix flow (#3394), not a live-spend path.
 */
@Injectable()
export class XAdsAdapter implements IAdsAdapter {
  readonly platform = 'x' as const;

  constructor(
    private readonly xAdsService: XAdsService,
    private readonly logger: LoggerService,
  ) {}

  async getAdAccounts(ctx: AdsAdapterContext): Promise<UnifiedAdAccount[]> {
    const accounts = await this.xAdsService.getAdAccounts(ctx.accessToken);

    return accounts.map((a) => ({
      currency: a.currency,
      id: a.id,
      name: a.name,
      platform: this.platform,
      status: a.approvalStatus,
      timezone: a.timezone,
    }));
  }

  async listCampaigns(ctx: AdsAdapterContext): Promise<UnifiedCampaign[]> {
    const campaigns = await this.xAdsService.listCampaigns(
      ctx.accessToken,
      ctx.adAccountId,
    );

    return campaigns.map((c) => this.toUnifiedCampaign(c));
  }

  async getCampaignInsights(
    ctx: AdsAdapterContext,
    campaignId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const rows = await this.xAdsService.getCampaignStats(
      ctx.accessToken,
      ctx.adAccountId,
      [campaignId],
      { endDate: dateRange.endDate, startDate: dateRange.startDate },
    );

    return this.toUnifiedInsights(rows[0], dateRange);
  }

  async getAdSetInsights(
    ctx: AdsAdapterContext,
    adSetId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const rows = await this.xAdsService.getLineItemStats(
      ctx.accessToken,
      ctx.adAccountId,
      [adSetId],
      { endDate: dateRange.endDate, startDate: dateRange.startDate },
    );

    return this.toUnifiedInsights(rows[0], dateRange);
  }

  async getAdInsights(
    ctx: AdsAdapterContext,
    adId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights> {
    const dateRange = resolveAdsInsightsDateRange(params, {
      defaultPreset: 'last_30d',
    });

    const rows = await this.xAdsService.getPromotedTweetStats(
      ctx.accessToken,
      ctx.adAccountId,
      [adId],
      { endDate: dateRange.endDate, startDate: dateRange.startDate },
    );

    return this.toUnifiedInsights(rows[0], dateRange);
  }

  async createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign> {
    const fundingInstrumentId = await this.resolveFundingInstrumentId(ctx);

    if (!fundingInstrumentId) {
      throw new BadRequestException(
        'X Ads account has no funding instrument available for campaign creation.',
      );
    }

    if (input.status && input.status !== 'PAUSED') {
      this.logger.warn(
        'XAdsAdapter.createCampaign: forcing entityStatus=PAUSED regardless of requested status — X Ads campaigns always launch paused',
        { requestedStatus: input.status },
      );
    }

    const campaign = await this.xAdsService.createCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      {
        dailyBudgetAmountLocalMicro:
          input.dailyBudget !== undefined
            ? Math.round(input.dailyBudget * 1_000_000)
            : undefined,
        entityStatus: 'PAUSED',
        fundingInstrumentId,
        name: input.name,
        totalBudgetAmountLocalMicro:
          input.lifetimeBudget !== undefined
            ? Math.round(input.lifetimeBudget * 1_000_000)
            : undefined,
      },
    );

    return this.toUnifiedCampaign(campaign);
  }

  async updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign> {
    if (input.status && input.status !== 'PAUSED') {
      throw new BadRequestException({
        detail:
          'X Ads campaigns can only be kept paused through this integration — activating a real campaign is not supported.',
        title: 'Unsupported campaign status',
      });
    }

    const campaign = await this.xAdsService.updateCampaign(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
      {
        dailyBudgetAmountLocalMicro:
          input.dailyBudget !== undefined
            ? Math.round(input.dailyBudget * 1_000_000)
            : undefined,
        entityStatus:
          input.status && isXAdsEntityStatus(input.status)
            ? input.status
            : undefined,
        name: input.name,
        totalBudgetAmountLocalMicro:
          input.lifetimeBudget !== undefined
            ? Math.round(input.lifetimeBudget * 1_000_000)
            : undefined,
      },
    );

    return this.toUnifiedCampaign(campaign);
  }

  async listAdSets(
    ctx: AdsAdapterContext,
    campaignId: string,
  ): Promise<UnifiedAdSet[]> {
    const lineItems = await this.xAdsService.listLineItems(
      ctx.accessToken,
      ctx.adAccountId,
      campaignId,
    );

    return lineItems.map((li) => this.toUnifiedAdSet(li));
  }

  async createAdSet(
    ctx: AdsAdapterContext,
    input: CreateAdSetInput,
  ): Promise<UnifiedAdSet> {
    if (Object.keys(input.targeting ?? {}).length > 0) {
      throw new BadRequestException({
        detail:
          'The unified targeting shape cannot be encoded by the X Ads line-item endpoint.',
        title: 'Unsupported X Ads targeting',
      });
    }

    const objective = input.optimizationGoal ?? 'ENGAGEMENTS';
    if (!isXAdsObjective(objective)) {
      throw new BadRequestException({
        detail: `Unsupported X Ads optimization goal: ${objective}`,
        title: 'Unsupported X Ads optimization goal',
      });
    }

    // Line items are the X Ads equivalent of ad sets. They always launch
    // PAUSED — CreateAdSetInput has no caller-supplied status to override.
    const lineItem = await this.xAdsService.createLineItem(
      ctx.accessToken,
      ctx.adAccountId,
      {
        dailyBudgetAmountLocalMicro:
          input.dailyBudget !== undefined
            ? Math.round(input.dailyBudget * 1_000_000)
            : undefined,
        campaignId: input.campaignId,
        endTime: input.endTime,
        entityStatus: 'PAUSED',
        name: input.name,
        objective,
        placements: ['ALL_ON_TWITTER'],
        productType: 'PROMOTED_TWEETS',
        startTime: input.startTime,
      },
    );

    return this.toUnifiedAdSet(lineItem);
  }

  async listAds(
    ctx: AdsAdapterContext,
    adSetId?: string,
  ): Promise<UnifiedAd[]> {
    const promotedTweets = await this.xAdsService.listPromotedTweets(
      ctx.accessToken,
      ctx.adAccountId,
      adSetId,
    );

    return promotedTweets.map((tweet) => this.toUnifiedAd(tweet));
  }

  async createAd(
    _ctx: AdsAdapterContext,
    _input: CreateAdInput,
  ): Promise<UnifiedAd> {
    // X Ads promotes an existing tweet by id rather than accepting the
    // generic title/body/image/video creative shape — there is no tweet id
    // slot on CreateAdInput, so this unified operation cannot be mapped.
    this.logger.warn(
      'XAdsAdapter.createAd: unsupported because X Ads promotes an existing tweet id, not synthesized ad creative',
    );

    throw new BadRequestException(
      'X Ads does not support this unified createAd operation. Promote an existing tweet via the X Ads promoted-tweet flow instead.',
    );
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

    const promotedTweets = await this.xAdsService.listPromotedTweets(
      ctx.accessToken,
      ctx.adAccountId,
    );

    if (promotedTweets.length === 0) {
      return [];
    }

    const rows = await this.xAdsService.getPromotedTweetStats(
      ctx.accessToken,
      ctx.adAccountId,
      promotedTweets.map((tweet) => tweet.id),
      { endDate: dateRange.endDate, startDate: dateRange.startDate },
    );
    const promotedTweetsById = new Map(
      promotedTweets.map((tweet) => [tweet.id, tweet]),
    );

    return rows
      .map((row) => {
        const insights = this.toUnifiedInsights(row, dateRange);
        const metricMap: Record<string, number> = {
          clicks: insights.clicks,
          conversions: insights.conversions || 0,
          cpc: insights.cpc,
          cpm: insights.cpm,
          ctr: insights.ctr,
          impressions: insights.impressions,
          spend: insights.spend,
        };

        return {
          id: row.id,
          insights,
          metric,
          name: promotedTweetsById.get(row.id)?.tweetId || row.id,
          value: metricMap[metric] || 0,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, params?.limit || 10);
  }

  private toUnifiedCampaign(campaign: XAdsCampaign): UnifiedCampaign {
    return {
      dailyBudget:
        campaign.dailyBudgetAmountLocalMicro !== undefined
          ? campaign.dailyBudgetAmountLocalMicro / 1_000_000
          : undefined,
      endDate: campaign.endTime,
      id: campaign.id,
      lifetimeBudget:
        campaign.totalBudgetAmountLocalMicro !== undefined
          ? campaign.totalBudgetAmountLocalMicro / 1_000_000
          : undefined,
      // X Ads has no campaign-level objective — objective lives on the line
      // item (unified ad set) instead.
      name: campaign.name,
      objective: '',
      platform: this.platform,
      startDate: campaign.startTime,
      status: campaign.entityStatus,
    };
  }

  private toUnifiedAdSet(lineItem: XAdsLineItem): UnifiedAdSet {
    return {
      campaignId: lineItem.campaignId,
      dailyBudget:
        lineItem.dailyBudgetAmountLocalMicro !== undefined
          ? lineItem.dailyBudgetAmountLocalMicro / 1_000_000
          : undefined,
      id: lineItem.id,
      name: lineItem.name,
      optimizationGoal: lineItem.objective,
      platform: this.platform,
      status: lineItem.entityStatus,
      targeting: lineItem.targeting,
    };
  }

  private toUnifiedAd(tweet: XAdsPromotedTweet): UnifiedAd {
    return {
      adSetId: tweet.lineItemId,
      id: tweet.id,
      name: tweet.tweetId,
      platform: this.platform,
      status: tweet.entityStatus,
    };
  }

  /**
   * X Ads reports a single TOTAL-granularity row per requested entity id, so
   * unlike TikTok's per-day rows this is already a window aggregate — no
   * summing across rows is needed, only ratio derivation from the totals.
   */
  private toUnifiedInsights(
    row: XAdsInsightsRow | undefined,
    dateRange: AdsInsightsDateRange,
  ): UnifiedInsights {
    if (!row) {
      return emptyUnifiedInsights(this.platform);
    }

    const { billedCharge, clicks, conversionValue, conversions, impressions } =
      row.metrics;

    return {
      clicks,
      conversions,
      cpa: conversions ? billedCharge / conversions : undefined,
      cpc: clicks > 0 ? billedCharge / clicks : 0,
      cpm: impressions > 0 ? (billedCharge / impressions) * 1000 : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      dateStart: dateRange.startDate,
      dateStop: dateRange.endDate,
      impressions,
      platform: this.platform,
      revenue: conversionValue,
      roas:
        conversionValue && billedCharge > 0
          ? conversionValue / billedCharge
          : undefined,
      spend: billedCharge,
    };
  }

  private async resolveFundingInstrumentId(
    ctx: AdsAdapterContext,
  ): Promise<string | undefined> {
    const instruments = await this.xAdsService.getFundingInstruments(
      ctx.accessToken,
      ctx.adAccountId,
    );

    return (
      instruments.find((instrument) => instrument.entityStatus === 'ACTIVE') ??
      instruments[0]
    )?.id;
  }
}
