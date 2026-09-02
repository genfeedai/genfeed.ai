import type {
  XAdsAccount,
  XAdsApiResponse,
  XAdsCampaign,
  XAdsCreateCampaignParams,
  XAdsCreateLineItemParams,
  XAdsCreatePromotedTweetParams,
  XAdsEntityStatus,
  XAdsFundingInstrument,
  XAdsInsightsRow,
  XAdsLineItem,
  XAdsPromotedTweet,
  XAdsReportingParams,
  XAdsRequestCredentials,
  XAdsTweet,
} from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { XAdsOAuthService } from './x-ads-oauth.service';

type XAdsReportingEntity = 'CAMPAIGN' | 'LINE_ITEM' | 'PROMOTED_TWEET';
const X_ADS_STATS_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function safeXAdsErrorMetadata(error: unknown): {
  name: string;
  status?: number;
} {
  if (error instanceof HttpException) {
    return { name: error.name, status: error.getStatus() };
  }
  return { name: error instanceof Error ? error.name : 'UnknownError' };
}

/**
 * X Ads API v12 client. Every provider call goes through the OAuth 1.0a Ads
 * client created from the X Ads application key plus the credential's access
 * token and secret. OAuth 2.0 bearer and refresh semantics are intentionally
 * absent from this surface.
 */
@Injectable()
export class XAdsService {
  private static readonly RATE_LIMIT_DELAY_MS = 250;
  private static readonly PUBLISHED_TWEET_ID_LIMIT = 200;
  private static readonly STATS_ENTITY_ID_LIMIT = 20;
  private static readonly STATS_METRIC_GROUPS = [
    ['ENGAGEMENT', 'BILLING'],
    ['WEB_CONVERSION'],
  ] as const;
  private static readonly STATS_PLACEMENTS = [
    'ALL_ON_TWITTER',
    'SPOTLIGHT',
    'TREND',
  ] as const;

  private readonly constructorName: string = String(this.constructor.name);
  private lastRequestTime = 0;
  private rateLimitQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly xAdsOAuthService: XAdsOAuthService,
  ) {}

  async getAdAccounts(
    credentials: XAdsRequestCredentials,
  ): Promise<XAdsAccount[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePaginatedRequest<{
        id: string;
        name: string;
        timezone: string;
        currency: string;
        approval_status: string;
      }>(credentials, '/accounts');

      return response.map((account) => ({
        approvalStatus: account.approval_status,
        currency: account.currency,
        id: account.id,
        name: account.name,
        timezone: account.timezone,
      }));
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async getFundingInstruments(
    credentials: XAdsRequestCredentials,
    accountId: string,
  ): Promise<XAdsFundingInstrument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePaginatedRequest<{
        id: string;
        type: string;
        entity_status: XAdsEntityStatus;
        currency: string;
      }>(credentials, `/accounts/${accountId}/funding_instruments`);

      return response.map((instrument) => ({
        currency: instrument.currency,
        entityStatus: instrument.entity_status,
        id: instrument.id,
        type: instrument.type,
      }));
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async listCampaigns(
    credentials: XAdsRequestCredentials,
    accountId: string,
  ): Promise<XAdsCampaign[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePaginatedRequest<XAdsCampaignWireShape>(
        credentials,
        `/accounts/${accountId}/campaigns`,
      );

      return response.map(mapWireCampaign);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async createCampaign(
    credentials: XAdsRequestCredentials,
    accountId: string,
    params: XAdsCreateCampaignParams,
  ): Promise<XAdsCampaign> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wireCampaign = await this.makePostRequest<XAdsCampaignWireShape>(
        credentials,
        `/accounts/${accountId}/campaigns`,
        {
          daily_budget_amount_local_micro: params.dailyBudgetAmountLocalMicro,
          end_time: params.endTime,
          entity_status: params.entityStatus,
          funding_instrument_id: params.fundingInstrumentId,
          name: params.name,
          start_time: params.startTime,
          total_budget_amount_local_micro: params.totalBudgetAmountLocalMicro,
        },
      );

      return mapWireCampaign(wireCampaign);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async updateCampaign(
    credentials: XAdsRequestCredentials,
    accountId: string,
    campaignId: string,
    params: Partial<XAdsCreateCampaignParams>,
  ): Promise<XAdsCampaign> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wireCampaign = await this.makePutRequest<XAdsCampaignWireShape>(
        credentials,
        `/accounts/${accountId}/campaigns/${campaignId}`,
        {
          daily_budget_amount_local_micro: params.dailyBudgetAmountLocalMicro,
          end_time: params.endTime,
          entity_status: params.entityStatus,
          name: params.name,
          start_time: params.startTime,
          total_budget_amount_local_micro: params.totalBudgetAmountLocalMicro,
        },
      );

      return mapWireCampaign(wireCampaign);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async listLineItems(
    credentials: XAdsRequestCredentials,
    accountId: string,
    campaignId?: string,
  ): Promise<XAdsLineItem[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePaginatedRequest<XAdsLineItemWireShape>(
        credentials,
        `/accounts/${accountId}/line_items`,
        { campaign_ids: campaignId },
      );

      return response.map(mapWireLineItem);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async createLineItem(
    credentials: XAdsRequestCredentials,
    accountId: string,
    params: XAdsCreateLineItemParams,
  ): Promise<XAdsLineItem> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (params.targeting && Object.keys(params.targeting).length > 0) {
        throw new BadRequestException(
          'X Ads targeting criteria require the dedicated targeting-criteria flow, which is not supported by this operation',
        );
      }

      const wireLineItem = await this.makePostRequest<XAdsLineItemWireShape>(
        credentials,
        `/accounts/${accountId}/line_items`,
        {
          bid_amount_local_micro: params.bidAmountLocalMicro,
          campaign_id: params.campaignId,
          daily_budget_amount_local_micro: params.dailyBudgetAmountLocalMicro,
          end_time: params.endTime,
          entity_status: params.entityStatus,
          name: params.name,
          objective: params.objective,
          placements: params.placements,
          product_type: params.productType,
          start_time: params.startTime,
          total_budget_amount_local_micro: params.totalBudgetAmountLocalMicro,
        },
      );

      return mapWireLineItem(wireLineItem);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async listPromotedTweets(
    credentials: XAdsRequestCredentials,
    accountId: string,
    lineItemId?: string,
  ): Promise<XAdsPromotedTweet[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response =
        await this.makePaginatedRequest<XAdsPromotedTweetWireShape>(
          credentials,
          `/accounts/${accountId}/promoted_tweets`,
          { line_item_ids: lineItemId },
        );

      return response.map(mapWirePromotedTweet);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async createPromotedTweet(
    credentials: XAdsRequestCredentials,
    accountId: string,
    params: XAdsCreatePromotedTweetParams,
  ): Promise<XAdsPromotedTweet> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wirePromotedTweets = await this.makePostRequest<
        XAdsPromotedTweetWireShape[]
      >(credentials, `/accounts/${accountId}/promoted_tweets`, {
        line_item_id: params.lineItemId,
        tweet_ids: [params.tweetId],
      });

      const wirePromotedTweet = wirePromotedTweets[0];
      if (!wirePromotedTweet) {
        throw new BadGatewayException(
          'X Ads API returned an empty promoted-tweet batch',
        );
      }

      return mapWirePromotedTweet(wirePromotedTweet);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  /**
   * Resolves published Tweets through the selected Ads account. X scopes this
   * endpoint to the account's promotable user, so a missing id is not eligible
   * for promotion through that account.
   */
  async listPublishedTweets(
    credentials: XAdsRequestCredentials,
    accountId: string,
    tweetIds: string[],
  ): Promise<XAdsTweet[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const tweets: XAdsTweet[] = [];
      for (
        let index = 0;
        index < tweetIds.length;
        index += XAdsService.PUBLISHED_TWEET_ID_LIMIT
      ) {
        const ids = tweetIds.slice(
          index,
          index + XAdsService.PUBLISHED_TWEET_ID_LIMIT,
        );
        const response = await this.makePaginatedRequest<{ id_str: string }>(
          credentials,
          `/accounts/${accountId}/tweets`,
          {
            timeline_type: 'ALL',
            trim_user: true,
            tweet_ids: ids,
            tweet_type: 'PUBLISHED',
          },
        );
        tweets.push(...response.map((tweet) => ({ id: tweet.id_str })));
      }

      return tweets;
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  async getCampaignStats(
    credentials: XAdsRequestCredentials,
    accountId: string,
    campaignIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      credentials,
      accountId,
      'CAMPAIGN',
      campaignIds,
      params,
    );
  }

  async getLineItemStats(
    credentials: XAdsRequestCredentials,
    accountId: string,
    lineItemIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      credentials,
      accountId,
      'LINE_ITEM',
      lineItemIds,
      params,
    );
  }

  async getPromotedTweetStats(
    credentials: XAdsRequestCredentials,
    accountId: string,
    promotedTweetIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      credentials,
      accountId,
      'PROMOTED_TWEET',
      promotedTweetIds,
      params,
    );
  }

  private async getStats(
    credentials: XAdsRequestCredentials,
    accountId: string,
    entity: XAdsReportingEntity,
    entityIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (entityIds.length === 0) {
        return [];
      }

      const startTime = normalizeReportingBoundary(
        params.startDate,
        'startDate',
      );
      const endTime = normalizeReportingBoundary(params.endDate, 'endDate');
      const reportingWindows = buildReportingWindows(startTime, endTime);
      const totalsById = new Map<string, XAdsStatsAccumulator>();

      for (
        let index = 0;
        index < entityIds.length;
        index += XAdsService.STATS_ENTITY_ID_LIMIT
      ) {
        const ids = entityIds.slice(
          index,
          index + XAdsService.STATS_ENTITY_ID_LIMIT,
        );

        for (const window of reportingWindows) {
          for (const placement of XAdsService.STATS_PLACEMENTS) {
            for (const metricGroups of XAdsService.STATS_METRIC_GROUPS) {
              const response = await this.makeRequest<XAdsStatsWireShape[]>(
                credentials,
                `/stats/accounts/${accountId}`,
                {
                  end_time: window.endTime,
                  entity,
                  entity_ids: ids,
                  granularity: params.granularity ?? 'TOTAL',
                  metric_groups: metricGroups,
                  placement,
                  start_time: window.startTime,
                },
              );
              const isConversionRequest = metricGroups[0] === 'WEB_CONVERSION';

              for (const row of response) {
                const totals =
                  totalsById.get(row.id) ?? createEmptyStatsAccumulator();
                for (const idData of row.id_data) {
                  if (isConversionRequest) {
                    totals.conversions += sumPurchaseConversions(
                      idData.metrics.conversion_purchases,
                    );
                    totals.conversionValueMicro += sumPurchaseSaleAmount(
                      idData.metrics.conversion_purchases,
                    );
                    continue;
                  }

                  totals.billedChargeMicro += sumNumericMetric(
                    idData.metrics.billed_charge_local_micro,
                  );
                  totals.billedEngagements += sumNumericMetric(
                    idData.metrics.billed_engagements,
                  );
                  totals.clicks += sumNumericMetric(idData.metrics.clicks);
                  totals.impressions += sumNumericMetric(
                    idData.metrics.impressions,
                  );
                }
                totalsById.set(row.id, totals);
              }
            }
          }
        }
      }

      return Array.from(totalsById, ([id, totals]) => ({
        endTime,
        id,
        metrics: {
          billedCharge: totals.billedChargeMicro / 1_000_000,
          billedEngagements: totals.billedEngagements,
          clicks: totals.clicks,
          conversionValue: totals.conversionValueMicro / 1_000_000,
          conversions: totals.conversions,
          impressions: totals.impressions,
        },
        startTime,
      }));
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeXAdsErrorMetadata(error),
      );
      throw error;
    }
  }

  private async rateLimit(): Promise<void> {
    const reservation = this.rateLimitQueue.then(async () => {
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < XAdsService.RATE_LIMIT_DELAY_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, XAdsService.RATE_LIMIT_DELAY_MS - elapsed),
        );
      }
      this.lastRequestTime = Date.now();
    });

    this.rateLimitQueue = reservation.catch(() => undefined);
    await reservation;
  }

  private async makeRequest<T>(
    credentials: XAdsRequestCredentials,
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const envelope = await this.makeRequestEnvelope<T>(
      credentials,
      path,
      params,
    );
    return this.validateResponse(envelope);
  }

  private async makePaginatedRequest<T>(
    credentials: XAdsRequestCredentials,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;

    do {
      const envelope = await this.makeRequestEnvelope<T[]>(
        credentials,
        path,
        cursor ? { ...params, cursor } : params,
      );
      rows.push(...this.validateResponse(envelope));

      const nextCursor = envelope.next_cursor || undefined;
      if (nextCursor && nextCursor === cursor) {
        throw new BadGatewayException(
          'X Ads API returned a repeated pagination cursor',
        );
      }
      cursor = nextCursor;
    } while (cursor);

    return rows;
  }

  private async makeRequestEnvelope<T>(
    credentials: XAdsRequestCredentials,
    path: string,
    params?: Record<string, unknown>,
  ): Promise<XAdsApiResponse<T>> {
    await this.rateLimit();

    return this.xAdsOAuthService
      .createAdsClient(credentials)
      .get<XAdsApiResponse<T>>(
        this.normalizePath(path),
        this.toQueryParams(params),
        { timeout: 15_000 },
      );
  }

  private async makePostRequest<T>(
    credentials: XAdsRequestCredentials,
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();

    const envelope = await this.xAdsOAuthService
      .createAdsClient(credentials)
      .post<XAdsApiResponse<T>>(this.normalizePath(path), undefined, {
        query: this.toQueryParams(params),
        timeout: 15_000,
      });

    return this.validateResponse(envelope);
  }

  private async makePutRequest<T>(
    credentials: XAdsRequestCredentials,
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();

    const envelope = await this.xAdsOAuthService
      .createAdsClient(credentials)
      .put<XAdsApiResponse<T>>(this.normalizePath(path), undefined, {
        query: this.toQueryParams(params),
        timeout: 15_000,
      });

    return this.validateResponse(envelope);
  }

  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '');
  }

  private toQueryParams(
    params: Record<string, unknown> | undefined,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params ?? {}).flatMap(([key, value]) => {
        if (value === undefined) {
          return [];
        }

        return [[key, Array.isArray(value) ? value.join(',') : String(value)]];
      }),
    );
  }

  private validateResponse<T>(envelope: XAdsApiResponse<T>): T {
    if (envelope?.data === undefined || envelope.data === null) {
      throw new BadGatewayException('X Ads API returned an empty response');
    }
    return envelope.data;
  }
}

type XAdsNumericMetric = number | Array<number | null> | null;

interface XAdsConversionMetricWireShape {
  assisted?: XAdsNumericMetric;
  order_quantity?: XAdsNumericMetric;
  post_engagement?: XAdsNumericMetric;
  post_view?: XAdsNumericMetric;
  sale_amount?: XAdsNumericMetric;
}

interface XAdsStatsMetricsWireShape {
  billed_charge_local_micro?: XAdsNumericMetric;
  billed_engagements?: XAdsNumericMetric;
  clicks?: XAdsNumericMetric;
  conversion_purchases?: XAdsConversionMetricWireShape | XAdsNumericMetric;
  impressions?: XAdsNumericMetric;
}

interface XAdsStatsWireShape {
  id: string;
  id_data: Array<{
    segment?: unknown;
    metrics: XAdsStatsMetricsWireShape;
  }>;
}

interface XAdsStatsAccumulator {
  billedChargeMicro: number;
  billedEngagements: number;
  clicks: number;
  conversions: number;
  conversionValueMicro: number;
  impressions: number;
}

function createEmptyStatsAccumulator(): XAdsStatsAccumulator {
  return {
    billedChargeMicro: 0,
    billedEngagements: 0,
    clicks: 0,
    conversions: 0,
    conversionValueMicro: 0,
    impressions: 0,
  };
}

function isConversionMetric(
  value: XAdsConversionMetricWireShape | XAdsNumericMetric | undefined,
): value is XAdsConversionMetricWireShape {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReportingBoundary(value: string, field: string): string {
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value;
  const parsed = new Date(candidate);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCMinutes() !== 0 ||
    parsed.getUTCSeconds() !== 0 ||
    parsed.getUTCMilliseconds() !== 0
  ) {
    throw new BadRequestException(
      `X Ads reporting ${field} must be a valid ISO 8601 whole-hour boundary`,
    );
  }

  return parsed.toISOString().replace('.000Z', 'Z');
}

function buildReportingWindows(
  startTime: string,
  endTime: string,
): Array<{ endTime: string; startTime: string }> {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (endMs <= startMs) {
    throw new BadRequestException(
      'X Ads reporting endDate must be after startDate',
    );
  }

  const windows: Array<{ endTime: string; startTime: string }> = [];
  for (
    let windowStartMs = startMs;
    windowStartMs < endMs;
    windowStartMs += X_ADS_STATS_MAX_WINDOW_MS
  ) {
    const windowEndMs = Math.min(
      windowStartMs + X_ADS_STATS_MAX_WINDOW_MS,
      endMs,
    );
    windows.push({
      endTime: new Date(windowEndMs).toISOString().replace('.000Z', 'Z'),
      startTime: new Date(windowStartMs).toISOString().replace('.000Z', 'Z'),
    });
  }

  return windows;
}

function sumNumericMetric(value: XAdsNumericMetric | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce<number>(
    (total, entry) =>
      total + (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0),
    0,
  );
}

function sumPurchaseConversions(
  value: XAdsConversionMetricWireShape | XAdsNumericMetric | undefined,
): number {
  if (!isConversionMetric(value)) {
    return sumNumericMetric(value);
  }

  return (
    sumNumericMetric(value.post_view) + sumNumericMetric(value.post_engagement)
  );
}

function sumPurchaseSaleAmount(
  value: XAdsConversionMetricWireShape | XAdsNumericMetric | undefined,
): number {
  return isConversionMetric(value) ? sumNumericMetric(value.sale_amount) : 0;
}

interface XAdsCampaignWireShape {
  id: string;
  name: string;
  funding_instrument_id: string;
  entity_status: XAdsEntityStatus;
  daily_budget_amount_local_micro?: number;
  total_budget_amount_local_micro?: number;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
}

function mapWireCampaign(wire: XAdsCampaignWireShape): XAdsCampaign {
  return {
    createdAt: wire.created_at,
    dailyBudgetAmountLocalMicro: wire.daily_budget_amount_local_micro,
    endTime: wire.end_time,
    entityStatus: wire.entity_status,
    fundingInstrumentId: wire.funding_instrument_id,
    id: wire.id,
    name: wire.name,
    startTime: wire.start_time,
    totalBudgetAmountLocalMicro: wire.total_budget_amount_local_micro,
    updatedAt: wire.updated_at,
  };
}

interface XAdsLineItemWireShape {
  id: string;
  campaign_id: string;
  name: string;
  entity_status: XAdsEntityStatus;
  product_type: string;
  objective: string;
  bid_amount_local_micro?: number;
  daily_budget_amount_local_micro?: number;
  total_budget_amount_local_micro?: number;
  targeting_criteria?: Record<string, unknown>;
  placements?: string[];
  start_time?: string;
  end_time?: string;
}

function mapWireLineItem(wire: XAdsLineItemWireShape): XAdsLineItem {
  return {
    bidAmountLocalMicro: wire.bid_amount_local_micro,
    campaignId: wire.campaign_id,
    dailyBudgetAmountLocalMicro: wire.daily_budget_amount_local_micro,
    endTime: wire.end_time,
    entityStatus: wire.entity_status,
    id: wire.id,
    name: wire.name,
    objective: wire.objective,
    placements: wire.placements,
    productType: wire.product_type,
    startTime: wire.start_time,
    targeting: wire.targeting_criteria,
    totalBudgetAmountLocalMicro: wire.total_budget_amount_local_micro,
  };
}

interface XAdsPromotedTweetWireShape {
  id: string;
  line_item_id: string;
  tweet_id: string;
  entity_status: XAdsEntityStatus;
  approval_status: string;
}

function mapWirePromotedTweet(
  wire: XAdsPromotedTweetWireShape,
): XAdsPromotedTweet {
  return {
    approvalStatus: wire.approval_status,
    entityStatus: wire.entity_status,
    id: wire.id,
    lineItemId: wire.line_item_id,
    tweetId: wire.tweet_id,
  };
}
