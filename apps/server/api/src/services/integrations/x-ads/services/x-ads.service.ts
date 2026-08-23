import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
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
} from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type XAdsReportingEntity = 'CAMPAIGN' | 'LINE_ITEM' | 'PROMOTED_TWEET';

/**
 * X Ads API v12 client (REST) plus token refresh. Mirrors the internals of
 * `TikTokAdsService` (base URL / header / rate-limit helpers) and the
 * `GoogleAdsService.refreshToken` shape (a plain service method, not an
 * organic-social disconnect flow), but authenticates via the shared
 * `twitter-api-v2` OAuth 2.0 PKCE client (`XAdsOAuthService`), since X Ads
 * shares its OAuth provider with organic X.
 */
@Injectable()
export class XAdsService {
  private static readonly API_VERSION = 'v12';
  private static readonly BASE_URL = 'https://ads-api.x.com';
  private static readonly RATE_LIMIT_DELAY_MS = 250;

  private readonly constructorName: string = String(this.constructor.name);
  private lastRequestTime = 0;

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly xAdsOAuthService: XAdsOAuthService,
  ) {}

  async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.findOne({
      brandId,
      organizationId,
      platform: CredentialPlatform.X_ADS,
    });

    if (!credential?.refreshToken) {
      throw new Error('X Ads credential not found');
    }

    try {
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      const { accessToken, refreshToken, expiresIn, scope } =
        await this.xAdsOAuthService.refreshAccessToken(decryptedRefreshToken);

      return await this.credentialsService.patch(credential.id, {
        accessToken,
        accessTokenExpiry: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        refreshToken,
        ...buildGrantedScopesCredentialPatch(scope),
      });
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw error;
    }
  }

  async getAdAccounts(accessToken: string): Promise<XAdsAccount[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<
        Array<{
          id: string;
          name: string;
          timezone: string;
          currency: string;
          approval_status: string;
        }>
      >(accessToken, '/accounts');

      return response.map((account) => ({
        approvalStatus: account.approval_status,
        currency: account.currency,
        id: account.id,
        name: account.name,
        timezone: account.timezone,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getFundingInstruments(
    accessToken: string,
    accountId: string,
  ): Promise<XAdsFundingInstrument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<
        Array<{
          id: string;
          type: string;
          entity_status: XAdsEntityStatus;
          currency: string;
        }>
      >(accessToken, `/accounts/${accountId}/funding_instruments`);

      return response.map((instrument) => ({
        currency: instrument.currency,
        entityStatus: instrument.entity_status,
        id: instrument.id,
        type: instrument.type,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listCampaigns(
    accessToken: string,
    accountId: string,
  ): Promise<XAdsCampaign[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<Array<XAdsCampaignWireShape>>(
        accessToken,
        `/accounts/${accountId}/campaigns`,
      );

      return response.map(mapWireCampaign);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createCampaign(
    accessToken: string,
    accountId: string,
    params: XAdsCreateCampaignParams,
  ): Promise<XAdsCampaign> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wireCampaign = await this.makePostRequest<XAdsCampaignWireShape>(
        accessToken,
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
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateCampaign(
    accessToken: string,
    accountId: string,
    campaignId: string,
    params: Partial<XAdsCreateCampaignParams>,
  ): Promise<XAdsCampaign> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wireCampaign = await this.makePutRequest<XAdsCampaignWireShape>(
        accessToken,
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
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listLineItems(
    accessToken: string,
    accountId: string,
    campaignId?: string,
  ): Promise<XAdsLineItem[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const query = campaignId ? `?campaign_ids=${campaignId}` : '';
      const response = await this.makeRequest<Array<XAdsLineItemWireShape>>(
        accessToken,
        `/accounts/${accountId}/line_items${query}`,
      );

      return response.map(mapWireLineItem);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createLineItem(
    accessToken: string,
    accountId: string,
    params: XAdsCreateLineItemParams,
  ): Promise<XAdsLineItem> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wireLineItem = await this.makePostRequest<XAdsLineItemWireShape>(
        accessToken,
        `/accounts/${accountId}/line_items`,
        {
          bid_amount_local_micro: params.bidAmountLocalMicro,
          campaign_id: params.campaignId,
          end_time: params.endTime,
          entity_status: params.entityStatus,
          name: params.name,
          objective: params.objective,
          placements: params.placements,
          product_type: params.productType,
          start_time: params.startTime,
          targeting_criteria: params.targeting,
        },
      );

      return mapWireLineItem(wireLineItem);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listPromotedTweets(
    accessToken: string,
    accountId: string,
    lineItemId?: string,
  ): Promise<XAdsPromotedTweet[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const query = lineItemId ? `?line_item_ids=${lineItemId}` : '';
      const response = await this.makeRequest<
        Array<XAdsPromotedTweetWireShape>
      >(accessToken, `/accounts/${accountId}/promoted_tweets${query}`);

      return response.map(mapWirePromotedTweet);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createPromotedTweet(
    accessToken: string,
    accountId: string,
    params: XAdsCreatePromotedTweetParams,
  ): Promise<XAdsPromotedTweet> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const wirePromotedTweet =
        await this.makePostRequest<XAdsPromotedTweetWireShape>(
          accessToken,
          `/accounts/${accountId}/promoted_tweets`,
          {
            line_item_id: params.lineItemId,
            tweet_ids: [params.tweetId],
          },
        );

      return mapWirePromotedTweet(wirePromotedTweet);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getCampaignStats(
    accessToken: string,
    accountId: string,
    campaignIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      accessToken,
      accountId,
      'CAMPAIGN',
      campaignIds,
      params,
    );
  }

  async getLineItemStats(
    accessToken: string,
    accountId: string,
    lineItemIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      accessToken,
      accountId,
      'LINE_ITEM',
      lineItemIds,
      params,
    );
  }

  async getPromotedTweetStats(
    accessToken: string,
    accountId: string,
    promotedTweetIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    return this.getStats(
      accessToken,
      accountId,
      'PROMOTED_TWEET',
      promotedTweetIds,
      params,
    );
  }

  private async getStats(
    accessToken: string,
    accountId: string,
    entity: XAdsReportingEntity,
    entityIds: string[],
    params: XAdsReportingParams,
  ): Promise<XAdsInsightsRow[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const query = new URLSearchParams({
        end_time: params.endDate,
        entity,
        entity_ids: entityIds.join(','),
        granularity: params.granularity ?? 'TOTAL',
        placement: 'ALL_ON_TWITTER',
        start_time: params.startDate,
      });

      const response = await this.makeRequest<
        Array<{
          id: string;
          id_data: Array<{
            segment?: unknown;
            metrics: Record<string, number[] | null>;
          }>;
        }>
      >(accessToken, `/stats/accounts/${accountId}?${query.toString()}`);

      return response.map((row) => {
        const metrics = row.id_data[0]?.metrics ?? {};
        const sum = (values: number[] | null | undefined) =>
          (values ?? []).reduce((total, value) => total + (value ?? 0), 0);

        return {
          endTime: params.endDate,
          id: row.id,
          metrics: {
            billedCharge: sum(metrics.billed_charge_local_micro) / 1_000_000,
            billedEngagements: sum(metrics.billed_engagements),
            clicks: sum(metrics.clicks),
            conversionValue: sum(metrics.conversion_purchases_value),
            conversions: sum(metrics.conversion_purchases),
            impressions: sum(metrics.impressions),
          },
          startTime: params.startDate,
        };
      });
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < XAdsService.RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, XAdsService.RATE_LIMIT_DELAY_MS - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }

  private async makeRequest<T>(accessToken: string, path: string): Promise<T> {
    await this.rateLimit();

    const response = await firstValueFrom(
      this.httpService.get<XAdsApiResponse<T>>(
        `${XAdsService.BASE_URL}/${XAdsService.API_VERSION}${path}`,
        { headers: this.getHeaders(accessToken), timeout: 15000 },
      ),
    );

    return this.validateResponse(response.data);
  }

  private async makePostRequest<T>(
    accessToken: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();

    const response = await firstValueFrom(
      this.httpService.post<XAdsApiResponse<T>>(
        `${XAdsService.BASE_URL}/${XAdsService.API_VERSION}${path}`,
        body,
        { headers: this.getHeaders(accessToken), timeout: 15000 },
      ),
    );

    return this.validateResponse(response.data);
  }

  private async makePutRequest<T>(
    accessToken: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();

    const response = await firstValueFrom(
      this.httpService.put<XAdsApiResponse<T>>(
        `${XAdsService.BASE_URL}/${XAdsService.API_VERSION}${path}`,
        body,
        { headers: this.getHeaders(accessToken), timeout: 15000 },
      ),
    );

    return this.validateResponse(response.data);
  }

  private validateResponse<T>(envelope: XAdsApiResponse<T>): T {
    if (envelope?.data === undefined) {
      throw new Error('X Ads API returned an empty response');
    }
    return envelope.data;
  }
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
  targeting_criteria?: Record<string, unknown>;
  placements?: string[];
  start_time?: string;
  end_time?: string;
}

function mapWireLineItem(wire: XAdsLineItemWireShape): XAdsLineItem {
  return {
    bidAmountLocalMicro: wire.bid_amount_local_micro,
    campaignId: wire.campaign_id,
    endTime: wire.end_time,
    entityStatus: wire.entity_status,
    id: wire.id,
    name: wire.name,
    objective: wire.objective,
    placements: wire.placements,
    productType: wire.product_type,
    startTime: wire.start_time,
    targeting: wire.targeting_criteria,
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
