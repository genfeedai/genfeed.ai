import { ConfigService } from '@api/config/config.service';
import type {
  TikTokAdAccount,
  TikTokAdGroupListResponse,
  TikTokAdListResponse,
  TikTokApiResponse,
  TikTokCampaign,
  TikTokCampaignListResponse,
  TikTokCreateAdGroupParams,
  TikTokCreateAdParams,
  TikTokCreateCampaignParams,
  TikTokImageUploadResponse,
  TikTokInsightsData,
  TikTokReportingParams,
  TikTokReportRow,
  TikTokVideoUploadResponse,
} from '@api/services/integrations/tiktok-ads/interfaces/tiktok-ads.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const MICROS_MULTIPLIER = 1_000_000;
const MICROS_DIVISOR = 1_000_000;
const RATE_LIMIT_DELAY_MS = 2000;

@Injectable()
export class TikTokAdsService {
  private readonly BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  // ─── Read Operations ────────────────────────────────────────────────────────

  async getAdAccounts(accessToken: string): Promise<TikTokAdAccount[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<{
        list: Array<{
          advertiser_id: string;
          advertiser_name: string;
          currency: string;
          timezone: string;
          status: string;
          role: string;
        }>;
      }>(accessToken, 'oauth2/advertiser/get', {});

      return (response.list || []).map((a) => ({
        advertiserId: a.advertiser_id,
        advertiserName: a.advertiser_name,
        currency: a.currency,
        role: a.role,
        status: a.status,
        timezone: a.timezone,
      }));
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listCampaigns(
    accessToken: string,
    advertiserId: string,
    params?: { status?: string; pageSize?: number },
  ): Promise<TikTokCampaign[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const queryParams: Record<string, unknown> = {
        advertiser_id: advertiserId,
        page_size: params?.pageSize || 50,
      };

      if (params?.status) {
        queryParams.filtering = JSON.stringify({
          campaign_status: params.status,
        });
      }

      const response = await this.makeRequest<TikTokCampaignListResponse>(
        accessToken,
        'campaign/get',
        queryParams,
      );

      return (response.list || []).map((c) => ({
        budget: c.budget / MICROS_DIVISOR,
        budgetMode: c.budget_mode,
        campaignId: c.campaign_id,
        campaignName: c.campaign_name,
        createTime: c.create_time,
        modifyTime: c.modify_time,
        objective: c.objective_type,
        status: c.status,
      }));
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getCampaignInsights(
    accessToken: string,
    advertiserId: string,
    campaignId: string,
    params: TikTokReportingParams,
  ): Promise<TikTokInsightsData[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePostRequest<{
        list: TikTokReportRow[];
      }>(accessToken, 'report/integrated/get', {
        advertiser_id: advertiserId,
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id', 'stat_time_day'],
        end_date: params.endDate,
        filtering: {
          campaign_ids: [campaignId],
        },
        metrics: [
          'spend',
          'impressions',
          'clicks',
          'ctr',
          'cpc',
          'cpm',
          'conversion',
          'cost_per_conversion',
          'conversion_rate',
          'reach',
          'frequency',
        ],
        page: params.page || 1,
        page_size: params.pageSize || 100,
        report_type: 'BASIC',
        start_date: params.startDate,
      });

      return (response.list || []).map((row) => this.normalizeReportRow(row));
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listAdGroups(
    accessToken: string,
    advertiserId: string,
    campaignId?: string,
    params?: { pageSize?: number },
  ): Promise<TikTokAdGroupListResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const queryParams: Record<string, unknown> = {
        advertiser_id: advertiserId,
        page_size: params?.pageSize || 50,
      };

      if (campaignId) {
        queryParams.filtering = JSON.stringify({
          campaign_ids: [campaignId],
        });
      }

      return this.makeRequest<TikTokAdGroupListResponse>(
        accessToken,
        'adgroup/get',
        queryParams,
      );
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listAds(
    accessToken: string,
    advertiserId: string,
    adGroupId?: string,
    params?: { pageSize?: number },
  ): Promise<TikTokAdListResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const queryParams: Record<string, unknown> = {
        advertiser_id: advertiserId,
        page_size: params?.pageSize || 50,
      };

      if (adGroupId) {
        queryParams.filtering = JSON.stringify({
          adgroup_ids: [adGroupId],
        });
      }

      return this.makeRequest<TikTokAdListResponse>(
        accessToken,
        'ad/get',
        queryParams,
      );
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getReporting(
    accessToken: string,
    advertiserId: string,
    params: TikTokReportingParams,
  ): Promise<TikTokInsightsData[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePostRequest<{
        list: TikTokReportRow[];
      }>(accessToken, 'report/integrated/get', {
        advertiser_id: advertiserId,
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: params.dimensions || ['stat_time_day'],
        end_date: params.endDate,
        metrics: params.metrics || [
          'spend',
          'impressions',
          'clicks',
          'ctr',
          'cpc',
          'cpm',
          'conversion',
          'cost_per_conversion',
        ],
        page: params.page || 1,
        page_size: params.pageSize || 100,
        report_type: 'BASIC',
        start_date: params.startDate,
      });

      return (response.list || []).map((row) => this.normalizeReportRow(row));
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  // ─── Write Operations ────────────────────────────────────────────────────────

  async createCampaign(
    accessToken: string,
    advertiserId: string,
    params: TikTokCreateCampaignParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        advertiser_id: advertiserId,
        budget_mode: params.budgetMode,
        campaign_name: params.campaignName,
        objective_type: params.objectiveType,
      };

      if (params.budget !== undefined) {
        data.budget = Math.round(params.budget * MICROS_MULTIPLIER);
      }
      if (params.status) {
        data.operation_status = params.status;
      }

      const response = await this.makePostRequest<{
        campaign_id: string;
      }>(accessToken, 'campaign/create', data);

      this.logger.log(
        `${caller} created campaign ${response.campaign_id} for ${advertiserId}`,
      );
      return response.campaign_id;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateCampaign(
    accessToken: string,
    advertiserId: string,
    campaignId: string,
    params: Partial<TikTokCreateCampaignParams>,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        advertiser_id: advertiserId,
        campaign_id: campaignId,
      };

      if (params.campaignName) data.campaign_name = params.campaignName;
      if (params.budget !== undefined) {
        data.budget = Math.round(params.budget * MICROS_MULTIPLIER);
      }
      if (params.status) data.operation_status = params.status;

      await this.makePostRequest(accessToken, 'campaign/update', data);

      this.logger.log(`${caller} updated campaign ${campaignId}`);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async pauseCampaign(
    accessToken: string,
    advertiserId: string,
    campaignId: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.makePostRequest(accessToken, 'campaign/status/update', {
        advertiser_id: advertiserId,
        campaign_ids: [campaignId],
        opt_status: 'DISABLE',
      });

      this.logger.log(`${caller} paused campaign ${campaignId}`);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createAdGroup(
    accessToken: string,
    advertiserId: string,
    params: TikTokCreateAdGroupParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        adgroup_name: params.adgroupName,
        advertiser_id: advertiserId,
        billing_event: params.billingEvent,
        budget: Math.round(params.budget * MICROS_MULTIPLIER),
        budget_mode: params.budgetMode,
        campaign_id: params.campaignId,
        optimization_goal: params.optimizationGoal,
      };

      if (params.scheduleStartTime) {
        data.schedule_start_time = params.scheduleStartTime;
      }
      if (params.scheduleEndTime) {
        data.schedule_end_time = params.scheduleEndTime;
      }
      if (params.targeting) {
        data.targeting = params.targeting;
      }

      const response = await this.makePostRequest<{
        adgroup_id: string;
      }>(accessToken, 'adgroup/create', data);

      this.logger.log(
        `${caller} created ad group ${response.adgroup_id} for ${advertiserId}`,
      );
      return response.adgroup_id;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createAd(
    accessToken: string,
    advertiserId: string,
    params: TikTokCreateAdParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        ad_name: params.adName,
        adgroup_id: params.adgroupId,
        advertiser_id: advertiserId,
        landing_page_url: params.landingPageUrl,
      };

      if (params.adText) data.ad_text = params.adText;
      if (params.imageIds) data.image_ids = params.imageIds;
      if (params.videoId) data.video_id = params.videoId;
      if (params.callToAction) data.call_to_action = params.callToAction;

      const response = await this.makePostRequest<{
        ad_id: string;
      }>(accessToken, 'ad/create', data);

      this.logger.log(
        `${caller} created ad ${response.ad_id} for ${advertiserId}`,
      );
      return response.ad_id;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async uploadImage(
    accessToken: string,
    advertiserId: string,
    imageUrl: string,
  ): Promise<TikTokImageUploadResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePostRequest<{
        id: string;
        image_url: string;
      }>(accessToken, 'file/image/ad/upload', {
        advertiser_id: advertiserId,
        image_url: imageUrl,
        upload_type: 'UPLOAD_BY_URL',
      });

      this.logger.log(
        `${caller} uploaded image ${response.id} for ${advertiserId}`,
      );
      return { imageId: response.id, imageUrl: response.image_url };
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async uploadVideo(
    accessToken: string,
    advertiserId: string,
    videoUrl: string,
  ): Promise<TikTokVideoUploadResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePostRequest<{
        video_id: string;
      }>(accessToken, 'file/video/ad/upload', {
        advertiser_id: advertiserId,
        upload_type: 'UPLOAD_BY_URL',
        video_url: videoUrl,
      });

      this.logger.log(
        `${caller} uploaded video ${response.video_id} for ${advertiserId}`,
      );
      return { videoId: response.video_id };
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async makeRequest<T>(
    accessToken: string,
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();
    const url = `${this.BASE_URL}/${path}/`;
    const response = await firstValueFrom(
      this.httpService.get<TikTokApiResponse<T>>(url, {
        headers: this.getHeaders(accessToken),
        params,
        timeout: 30000,
      }),
    );

    this.validateResponse(response.data);
    return response.data.data;
  }

  private async makePostRequest<T>(
    accessToken: string,
    path: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    await this.rateLimit();
    const url = `${this.BASE_URL}/${path}/`;
    const response = await firstValueFrom(
      this.httpService.post<TikTokApiResponse<T>>(url, data, {
        headers: this.getHeaders(accessToken),
        timeout: 30000,
      }),
    );

    this.validateResponse(response.data);
    return response.data.data;
  }

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
  }

  private validateResponse<T>(response: TikTokApiResponse<T>): void {
    if (response.code !== 0) {
      throw new Error(
        `TikTok API error ${response.code}: ${response.message} (request_id: ${response.request_id})`,
      );
    }
  }

  private normalizeReportRow(row: TikTokReportRow): TikTokInsightsData {
    return {
      clicks: Number(row.metrics.clicks || 0),
      conversionRate: Number(row.metrics.conversion_rate || 0),
      conversions: Number(row.metrics.conversion || 0),
      costPerConversion: Number(row.metrics.cost_per_conversion || 0),
      cpc: Number(row.metrics.cpc || 0),
      cpm: Number(row.metrics.cpm || 0),
      ctr: Number(row.metrics.ctr || 0),
      frequency: Number(row.metrics.frequency || 0),
      impressions: Number(row.metrics.impressions || 0),
      reach: Number(row.metrics.reach || 0),
      spend: Number(row.metrics.spend || 0),
      statTimeDay: row.dimensions.stat_time_day || '',
    };
  }

  private lastRequestTime = 0;

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }
}
