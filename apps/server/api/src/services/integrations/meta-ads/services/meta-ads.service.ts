import { ConfigService } from '@api/config/config.service';
import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  MetaAdAccount,
  MetaAdCreative,
  MetaAdSetTargeting,
  MetaCampaign,
  MetaCampaignComparison,
  MetaImageUploadResponse,
  MetaInsightsData,
  MetaInsightsParams,
  MetaTopPerformer,
  MetaVideoUploadResponse,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MetaAdsService {
  private readonly API_VERSION = 'v24.0';
  private readonly BASE_URL = 'https://graph.facebook.com';
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  private getApiUrl(path: string): string {
    return `${this.BASE_URL}/${this.API_VERSION}/${path}`;
  }

  private async makeRequest<T>(
    accessToken: string,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const url = this.getApiUrl(path);
    const response = await firstValueFrom(
      this.httpService.get<T>(url, {
        params: { access_token: accessToken, ...params },
        timeout: 30000,
      }),
    );
    return response.data;
  }

  async getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          account_id: string;
          currency: string;
          timezone_name: string;
          account_status: number;
        }>;
      }>(accessToken, 'me/adaccounts', {
        fields: 'id,name,account_id,currency,timezone_name,account_status',
        limit: 100,
      });

      return response.data.map((account) => ({
        accountId: account.account_id,
        currency: account.currency,
        id: account.id,
        name: account.name,
        status: account.account_status,
        timezone: account.timezone_name,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    params?: { status?: string; limit?: number },
  ): Promise<MetaCampaign[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          objective: string;
          status: string;
          daily_budget?: string;
          lifetime_budget?: string;
          start_time?: string;
          stop_time?: string;
        }>;
      }>(accessToken, `${adAccountId}/campaigns`, {
        fields:
          'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time',
        limit: params?.limit || 50,
        ...(params?.status && {
          filtering: JSON.stringify([
            {
              field: 'effective_status',
              operator: 'IN',
              value: [params.status],
            },
          ]),
        }),
      });

      return response.data.map((campaign) => ({
        dailyBudget: campaign.daily_budget
          ? Number(campaign.daily_budget) / 100
          : undefined,
        id: campaign.id,
        lifetimeBudget: campaign.lifetime_budget
          ? Number(campaign.lifetime_budget) / 100
          : undefined,
        name: campaign.name,
        objective: campaign.objective,
        startTime: campaign.start_time,
        status: campaign.status,
        stopTime: campaign.stop_time,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async getCampaignInsights(
    accessToken: string,
    campaignId: string,
    params?: MetaInsightsParams,
  ): Promise<MetaInsightsData[]> {
    return this.getInsights(accessToken, `${campaignId}/insights`, params);
  }

  async getAdSetInsights(
    accessToken: string,
    adSetId: string,
    params?: MetaInsightsParams,
  ): Promise<MetaInsightsData[]> {
    return this.getInsights(accessToken, `${adSetId}/insights`, params);
  }

  async getAdInsights(
    accessToken: string,
    adId: string,
    params?: MetaInsightsParams,
  ): Promise<MetaInsightsData[]> {
    return this.getInsights(accessToken, `${adId}/insights`, params);
  }

  private async getInsights(
    accessToken: string,
    path: string,
    params?: MetaInsightsParams,
  ): Promise<MetaInsightsData[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const fields = (
        params?.fields || [
          'spend',
          'impressions',
          'clicks',
          'ctr',
          'cpc',
          'cpm',
          'reach',
          'frequency',
          'actions',
          'action_values',
          'cost_per_action_type',
        ]
      ).join(',');

      const queryParams: Record<string, unknown> = { fields };

      if (params?.datePreset) {
        queryParams.date_preset = params.datePreset;
      } else if (params?.timeRange) {
        queryParams.time_range = JSON.stringify(params.timeRange);
      }

      const response = await this.makeRequest<{
        data: Array<Record<string, unknown>>;
      }>(accessToken, path, queryParams);

      return response.data.map((row) => this.normalizeInsights(row));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed for ${path}`, error);
      throw error;
    }
  }

  async getAdCreatives(
    accessToken: string,
    adAccountId: string,
    params?: { limit?: number },
  ): Promise<MetaAdCreative[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name?: string;
          title?: string;
          body?: string;
          call_to_action_type?: string;
          image_url?: string;
          video_id?: string;
          link_url?: string;
          thumbnail_url?: string;
        }>;
      }>(accessToken, `${adAccountId}/adcreatives`, {
        fields:
          'id,name,title,body,call_to_action_type,image_url,video_id,link_url,thumbnail_url',
        limit: params?.limit || 50,
      });

      return response.data.map((creative) => ({
        body: creative.body,
        callToActionType: creative.call_to_action_type,
        id: creative.id,
        imageUrl: creative.image_url,
        linkUrl: creative.link_url,
        name: creative.name,
        thumbnailUrl: creative.thumbnail_url,
        title: creative.title,
        videoId: creative.video_id,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async compareCampaigns(
    accessToken: string,
    campaignIds: string[],
    params?: MetaInsightsParams,
  ): Promise<MetaCampaignComparison> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const campaigns = await Promise.all(
        campaignIds.map(async (id) => {
          const insights = await this.getCampaignInsights(
            accessToken,
            id,
            params,
          );
          const campaignDetails = await this.makeRequest<{
            id: string;
            name: string;
          }>(accessToken, id, { fields: 'id,name' });

          return {
            id: campaignDetails.id,
            insights: insights[0] || ({} as MetaInsightsData),
            name: campaignDetails.name,
          };
        }),
      );

      return { campaigns };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async getTopPerformers(
    accessToken: string,
    adAccountId: string,
    metric: string,
    limit: number = 10,
  ): Promise<MetaTopPerformer[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makeRequest<{
        data: Array<{
          id: string;
          name: string;
          insights?: { data: Array<Record<string, unknown>> };
        }>;
      }>(accessToken, `${adAccountId}/ads`, {
        fields: `id,name,insights{spend,impressions,clicks,ctr,cpc,cpm,actions,action_values}`,
        limit: 100,
      });

      const adsWithMetrics = response.data
        .filter((ad) => ad.insights?.data?.[0])
        .map((ad) => {
          const insights = this.normalizeInsights(ad.insights!.data[0]);
          const value = this.extractMetricValue(insights, metric);
          return {
            id: ad.id,
            insights,
            metric,
            name: ad.name,
            value,
          };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

      return adsWithMetrics;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  // ─── Write Operations ────────────────────────────────────────────────────────

  private async makePostRequest<T>(
    accessToken: string,
    path: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    const url = this.getApiUrl(path);
    const response = await firstValueFrom(
      this.httpService.post<T>(url, null, {
        params: { access_token: accessToken, ...data },
        timeout: 30000,
      }),
    );
    return response.data;
  }

  private async makeDeleteRequest<T>(
    accessToken: string,
    path: string,
  ): Promise<T> {
    const url = this.getApiUrl(path);
    const response = await firstValueFrom(
      this.httpService.delete<T>(url, {
        params: { access_token: accessToken },
        timeout: 30000,
      }),
    );
    return response.data;
  }

  private buildTargetingSpec(targeting: MetaAdSetTargeting): string {
    const spec: Record<string, unknown> = {};

    if (targeting.geoLocations) {
      spec.geo_locations = targeting.geoLocations;
    }
    if (targeting.ageMin !== undefined) {
      spec.age_min = targeting.ageMin;
    }
    if (targeting.ageMax !== undefined) {
      spec.age_max = targeting.ageMax;
    }
    if (targeting.genders) {
      spec.genders = targeting.genders;
    }
    if (targeting.interests) {
      spec.interests = targeting.interests;
    }
    if (targeting.customAudiences) {
      spec.custom_audiences = targeting.customAudiences;
    }

    return JSON.stringify(spec);
  }

  async createCampaign(
    accessToken: string,
    adAccountId: string,
    params: CreateCampaignParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        name: params.name,
        objective: params.objective,
        special_ad_categories: JSON.stringify(params.specialAdCategories || []),
        status: params.status || 'PAUSED',
      };

      if (params.dailyBudget !== undefined) {
        data.daily_budget = Math.round(params.dailyBudget * 100);
      }
      if (params.lifetimeBudget !== undefined) {
        data.lifetime_budget = Math.round(params.lifetimeBudget * 100);
      }

      const response = await this.makePostRequest<{ id: string }>(
        accessToken,
        `${adAccountId}/campaigns`,
        data,
      );

      this.loggerService.log(
        `${caller} created campaign ${response.id} for ${adAccountId}`,
      );
      return response.id;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateCampaign(
    accessToken: string,
    campaignId: string,
    params: UpdateCampaignParams,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {};

      if (params.name !== undefined) data.name = params.name;
      if (params.status !== undefined) data.status = params.status;
      if (params.dailyBudget !== undefined) {
        data.daily_budget = Math.round(params.dailyBudget * 100);
      }
      if (params.lifetimeBudget !== undefined) {
        data.lifetime_budget = Math.round(params.lifetimeBudget * 100);
      }

      await this.makePostRequest(accessToken, campaignId, data);

      this.loggerService.log(`${caller} updated campaign ${campaignId}`);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async pauseCampaign(accessToken: string, campaignId: string): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.makePostRequest(accessToken, campaignId, {
        status: 'PAUSED',
      });

      this.loggerService.log(`${caller} paused campaign ${campaignId}`);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateCampaignBudget(
    accessToken: string,
    campaignId: string,
    dailyBudget?: number,
    lifetimeBudget?: number,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {};

      if (dailyBudget !== undefined) {
        data.daily_budget = Math.round(dailyBudget * 100);
      }
      if (lifetimeBudget !== undefined) {
        data.lifetime_budget = Math.round(lifetimeBudget * 100);
      }

      await this.makePostRequest(accessToken, campaignId, data);

      this.loggerService.log(
        `${caller} updated budget for campaign ${campaignId}`,
      );
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createAdSet(
    accessToken: string,
    adAccountId: string,
    params: CreateAdSetParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        billing_event: params.billingEvent,
        campaign_id: params.campaignId,
        name: params.name,
        optimization_goal: params.optimizationGoal,
        status: 'PAUSED',
        targeting: this.buildTargetingSpec(params.targeting),
      };

      if (params.dailyBudget !== undefined) {
        data.daily_budget = Math.round(params.dailyBudget * 100);
      }
      if (params.lifetimeBudget !== undefined) {
        data.lifetime_budget = Math.round(params.lifetimeBudget * 100);
      }
      if (params.startTime) {
        data.start_time = params.startTime;
      }
      if (params.endTime) {
        data.end_time = params.endTime;
      }

      const response = await this.makePostRequest<{ id: string }>(
        accessToken,
        `${adAccountId}/adsets`,
        data,
      );

      this.loggerService.log(
        `${caller} created adset ${response.id} for ${adAccountId}`,
      );
      return response.id;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateAdSet(
    accessToken: string,
    adSetId: string,
    params: UpdateAdSetParams,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {};

      if (params.name !== undefined) data.name = params.name;
      if (params.status !== undefined) data.status = params.status;
      if (params.dailyBudget !== undefined) {
        data.daily_budget = Math.round(params.dailyBudget * 100);
      }
      if (params.targeting !== undefined) {
        data.targeting = this.buildTargetingSpec(params.targeting);
      }

      await this.makePostRequest(accessToken, adSetId, data);

      this.loggerService.log(`${caller} updated adset ${adSetId}`);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createAd(
    accessToken: string,
    adAccountId: string,
    params: CreateAdParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const creativeSpec: Record<string, unknown> = {
        link_data: {
          link: params.creative.linkUrl,
          ...(params.creative.title && { name: params.creative.title }),
          ...(params.creative.body && { message: params.creative.body }),
          ...(params.creative.imageHash && {
            image_hash: params.creative.imageHash,
          }),
          ...(params.creative.callToAction && {
            call_to_action: {
              type: params.creative.callToAction,
              value: { link: params.creative.linkUrl },
            },
          }),
        },
        object_story_spec: {
          page_id: '', // Will be set by FB if page is connected
        },
      };

      if (params.creative.videoId) {
        creativeSpec.video_data = {
          video_id: params.creative.videoId,
          ...(params.creative.title && { title: params.creative.title }),
          ...(params.creative.body && { message: params.creative.body }),
          ...(params.creative.callToAction && {
            call_to_action: {
              type: params.creative.callToAction,
              value: { link: params.creative.linkUrl },
            },
          }),
        };
      }

      const data: Record<string, unknown> = {
        adset_id: params.adSetId,
        creative: JSON.stringify(creativeSpec),
        name: params.name,
        status: 'PAUSED',
      };

      const response = await this.makePostRequest<{ id: string }>(
        accessToken,
        `${adAccountId}/ads`,
        data,
      );

      this.loggerService.log(
        `${caller} created ad ${response.id} for ${adAccountId}`,
      );
      return response.id;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async pauseAd(accessToken: string, adId: string): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.makePostRequest(accessToken, adId, { status: 'PAUSED' });

      this.loggerService.log(`${caller} paused ad ${adId}`);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async deleteAd(accessToken: string, adId: string): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.makeDeleteRequest(accessToken, adId);

      this.loggerService.log(`${caller} deleted ad ${adId}`);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async uploadAdImage(
    accessToken: string,
    adAccountId: string,
    imageUrl: string,
  ): Promise<MetaImageUploadResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.makePostRequest<{
        images: Record<string, { hash: string; url: string }>;
      }>(accessToken, `${adAccountId}/adimages`, {
        url: imageUrl,
      });

      const imageData = Object.values(response.images)[0];
      this.loggerService.log(
        `${caller} uploaded image for ${adAccountId}, hash: ${imageData.hash}`,
      );
      return { hash: imageData.hash, url: imageData.url };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async uploadAdVideo(
    accessToken: string,
    adAccountId: string,
    videoUrl: string,
    title?: string,
  ): Promise<MetaVideoUploadResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const data: Record<string, unknown> = {
        file_url: videoUrl,
      };
      if (title) {
        data.title = title;
      }

      const response = await this.makePostRequest<{ id: string }>(
        accessToken,
        `${adAccountId}/advideos`,
        data,
      );

      this.loggerService.log(
        `${caller} uploaded video ${response.id} for ${adAccountId}`,
      );
      return { videoId: response.id };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private normalizeInsights(row: Record<string, unknown>): MetaInsightsData {
    return {
      actions: row.actions as MetaInsightsData['actions'],
      actionValues: row.action_values as MetaInsightsData['actionValues'],
      clicks: Number(row.clicks || 0),
      conversions: this.extractConversions(row),
      costPerResult: Number(
        (row.cost_per_action_type as Array<{ value: string }>)?.[0]?.value || 0,
      ),
      cpc: Number(row.cpc || 0),
      cpm: Number(row.cpm || 0),
      ctr: Number(row.ctr || 0),
      dateStart: String(row.date_start || ''),
      dateStop: String(row.date_stop || ''),
      frequency: Number(row.frequency || 0),
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      spend: Number(row.spend || 0),
    };
  }

  private extractConversions(row: Record<string, unknown>): number {
    const actions = row.actions as
      | Array<{ action_type: string; value: string }>
      | undefined;
    if (!actions) return 0;
    const conversion = actions.find(
      (a) =>
        a.action_type === 'offsite_conversion' ||
        a.action_type.startsWith('offsite_conversion.'),
    );
    return conversion ? Number(conversion.value) : 0;
  }

  private extractMetricValue(
    insights: MetaInsightsData,
    metric: string,
  ): number {
    const metricMap: Record<string, number> = {
      clicks: insights.clicks,
      conversions: insights.conversions || 0,
      cpc: insights.cpc,
      cpm: insights.cpm,
      ctr: insights.ctr,
      impressions: insights.impressions,
      reach: insights.reach || 0,
      spend: insights.spend,
    };
    return metricMap[metric] || 0;
  }
}
