import { SERVER_TOKENS, type ServerLogger } from '@api/server.dependencies';
import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  MetaAdAccount,
  MetaAdCreative,
  MetaAdSetTargeting,
  MetaAdVideo,
  MetaCampaign,
  MetaCampaignComparison,
  MetaImageUploadResponse,
  MetaInsightsData,
  MetaInsightsParams,
  MetaNamedAdObject,
  MetaTopPerformer,
  MetaVideoUploadResponse,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import {
  getIntegrationProviderDefinition,
  IntegrationHttpClient,
} from '@genfeedai/integrations';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface MetaGraphPage<T> {
  data: T[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

const MAX_GRAPH_PAGE_COUNT = 25;
const VIDEO_THUMBNAIL_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000] as const;

export class MetaGraphPaginationLimitError extends Error {
  constructor(path: string) {
    super(`Meta Graph pagination exceeded the safe page limit for ${path}.`);
    this.name = 'MetaGraphPaginationLimitError';
  }
}

@Injectable()
export class MetaAdsService {
  private readonly API_VERSION = 'v24.0';
  private readonly provider = getIntegrationProviderDefinition('meta_ads');
  private readonly BASE_URL =
    this.provider?.endpoints.apiBaseUrl ?? 'https://graph.facebook.com';
  private readonly constructorName: string = String(this.constructor.name);
  private readonly integrationHttpClient: IntegrationHttpClient;

  constructor(
    private readonly httpService: HttpService,
    @Inject(SERVER_TOKENS.logger)
    private readonly loggerService: ServerLogger,
  ) {
    this.integrationHttpClient = new IntegrationHttpClient({
      fetch: (input, init) => this.fetchViaHttpService(input, init),
      logger: this.loggerService,
    });
  }

  private getApiUrl(path: string): string {
    return `${this.BASE_URL}/${this.API_VERSION}/${path}`;
  }

  private toHttpServiceParams(
    searchParams: URLSearchParams,
  ): Record<string, string | number> {
    return Object.fromEntries(
      [...searchParams.entries()].map(([key, value]) => {
        // Meta object IDs (id, campaign_id, adset_id, account_id, …) are opaque
        // string handles that frequently exceed Number.MAX_SAFE_INTEGER.
        // Coercing them to numbers silently corrupts large IDs and breaks the
        // Graph API, so ID-typed keys must always stay strings. Genuinely
        // numeric fields (budgets, ages, etc.) are still coerced for axios.
        if (key === 'id' || key.endsWith('_id')) {
          return [key, value];
        }

        const numericValue = Number(value);
        return [
          key,
          value.trim() !== '' && Number.isFinite(numericValue)
            ? numericValue
            : value,
        ];
      }),
    );
  }

  private async fetchViaHttpService(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const parsedUrl = new URL(String(input));
    const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const params = this.toHttpServiceParams(parsedUrl.searchParams);
    const options = {
      headers: init?.headers as Record<string, string> | undefined,
      params,
      signal: init?.signal ?? undefined,
      timeout: 30000,
    };
    const method = init?.method ?? 'GET';
    const response = await firstValueFrom(
      method === 'POST'
        ? this.httpService.post(url, init?.body ?? null, options)
        : method === 'DELETE'
          ? this.httpService.delete(url, options)
          : this.httpService.get(url, options),
    );

    return new Response(JSON.stringify(response.data), {
      headers: { 'content-type': 'application/json' },
      status: response.status ?? 200,
    });
  }

  private buildIntegrationQuery(
    accessToken: string,
    params: Record<string, unknown> = {},
  ): Record<string, string | number | boolean | undefined> {
    return Object.fromEntries(
      Object.entries({ access_token: accessToken, ...params }).map(
        ([key, value]) => [
          key,
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === undefined
            ? value
            : JSON.stringify(value),
        ],
      ),
    );
  }

  private async makeRequest<T>(
    accessToken: string,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const url = this.getApiUrl(path);
    return await this.integrationHttpClient.request<T>({
      provider: this.provider,
      query: this.buildIntegrationQuery(accessToken, params),
      timeoutMs: 30000,
      url,
    });
  }

  private async listGraphPages<T>(
    accessToken: string,
    path: string,
    params: Record<string, unknown>,
    allPages: boolean,
  ): Promise<T[]> {
    const items: T[] = [];
    const seenCursors = new Set<string>();
    let after: string | undefined;
    let pageCount = 0;
    let shouldContinue = true;

    while (shouldContinue) {
      const response = await this.makeRequest<MetaGraphPage<T>>(
        accessToken,
        path,
        { ...params, ...(after ? { after } : {}) },
      );
      pageCount += 1;
      items.push(...response.data);
      const nextCursor = response.paging?.cursors?.after;
      if (
        !allPages ||
        typeof response.paging?.next !== 'string' ||
        !nextCursor ||
        seenCursors.has(nextCursor)
      ) {
        shouldContinue = false;
        continue;
      }
      if (pageCount >= MAX_GRAPH_PAGE_COUNT) {
        throw new MetaGraphPaginationLimitError(path);
      }
      seenCursors.add(nextCursor);
      after = nextCursor;
    }

    return items;
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
    params?: {
      allPages?: boolean;
      limit?: number;
      name?: string;
      status?: string;
    },
  ): Promise<MetaCampaign[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const filtering = [
        ...(params?.status
          ? [
              {
                field: 'effective_status',
                operator: 'IN',
                value: [params.status],
              },
            ]
          : []),
        ...(params?.name
          ? [{ field: 'name', operator: 'EQUAL', value: params.name }]
          : []),
      ];
      const campaigns = await this.listGraphPages<{
        id: string;
        name: string;
        objective: string;
        status: string;
        daily_budget?: string;
        lifetime_budget?: string;
        start_time?: string;
        stop_time?: string;
      }>(
        accessToken,
        `${adAccountId}/campaigns`,
        {
          fields:
            'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time',
          limit: params?.limit || 50,
          ...(filtering.length > 0 && {
            filtering: JSON.stringify(filtering),
          }),
        },
        Boolean(params?.allPages),
      );

      return campaigns.map((campaign) => ({
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

  async listAdSets(
    accessToken: string,
    adAccountId: string,
    campaignId?: string,
    options?: { allPages?: boolean; name?: string },
  ): Promise<MetaNamedAdObject[]> {
    const items = await this.listGraphPages<{
      campaign_id?: string;
      id: string;
      name: string;
      status: string;
    }>(
      accessToken,
      campaignId ? `${campaignId}/adsets` : `${adAccountId}/adsets`,
      {
        fields: 'id,name,status,campaign_id',
        limit: options?.name ? 1 : 200,
        ...(options?.name && {
          filtering: JSON.stringify([
            { field: 'name', operator: 'EQUAL', value: options.name },
          ]),
        }),
      },
      Boolean(options?.allPages),
    );
    return items
      .filter((item) => !campaignId || item.campaign_id === campaignId)
      .map(({ campaign_id, id, name, status }) => ({
        campaignId: campaign_id,
        id,
        name,
        status,
      }));
  }

  async listAds(
    accessToken: string,
    adAccountId: string,
    adSetId?: string,
    options?: { allPages?: boolean; name?: string },
  ): Promise<MetaNamedAdObject[]> {
    const items = await this.listGraphPages<{
      adset_id?: string;
      id: string;
      name: string;
      status: string;
    }>(
      accessToken,
      adSetId ? `${adSetId}/ads` : `${adAccountId}/ads`,
      {
        fields: 'id,name,status,adset_id',
        limit: options?.name ? 1 : 200,
        ...(options?.name && {
          filtering: JSON.stringify([
            { field: 'name', operator: 'EQUAL', value: options.name },
          ]),
        }),
      },
      Boolean(options?.allPages),
    );
    return items
      .filter((item) => !adSetId || item.adset_id === adSetId)
      .map(({ adset_id, id, name, status }) => ({
        adSetId: adset_id,
        id,
        name,
        status,
      }));
  }

  async listAdVideos(
    accessToken: string,
    adAccountId: string,
    options?: { allPages?: boolean },
  ): Promise<MetaAdVideo[]> {
    return this.listGraphPages<MetaAdVideo>(
      accessToken,
      `${adAccountId}/advideos`,
      { fields: 'id,title', limit: 200 },
      Boolean(options?.allPages),
    );
  }

  async getAdVideoThumbnailUrl(
    accessToken: string,
    videoId: string,
  ): Promise<string> {
    for (const delayMs of VIDEO_THUMBNAIL_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      const response = await this.makeRequest<
        MetaGraphPage<{ is_preferred?: boolean; uri?: string }>
      >(accessToken, `${videoId}/thumbnails`, {
        fields: 'is_preferred,uri',
        limit: 100,
      });
      const thumbnail =
        response.data.find((item) => item.is_preferred && item.uri)?.uri ??
        response.data.find((item) => item.uri)?.uri;
      if (thumbnail) return thumbnail;
    }
    throw new Error(
      'Meta video processing did not produce a usable thumbnail in time.',
    );
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
        .flatMap((ad) => {
          const insightData = ad.insights?.data[0];
          if (!insightData) return [];
          const insights = this.normalizeInsights(insightData);
          const value = this.extractMetricValue(insights, metric);
          return [
            {
              id: ad.id,
              insights,
              metric,
              name: ad.name,
              value,
            },
          ];
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
    return await this.integrationHttpClient.request<T>({
      method: 'POST',
      provider: this.provider,
      query: this.buildIntegrationQuery(accessToken, data),
      timeoutMs: 30000,
      url,
    });
  }

  private async makeDeleteRequest<T>(
    accessToken: string,
    path: string,
  ): Promise<T> {
    const url = this.getApiUrl(path);
    return await this.integrationHttpClient.request<T>({
      method: 'DELETE',
      provider: this.provider,
      query: this.buildIntegrationQuery(accessToken),
      timeoutMs: 30000,
      url,
    });
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

  async pauseAdSet(accessToken: string, adSetId: string): Promise<void> {
    await this.makePostRequest(accessToken, adSetId, { status: 'PAUSED' });
  }

  async createAd(
    accessToken: string,
    adAccountId: string,
    params: CreateAdParams,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const linkData = {
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
      };
      const objectStorySpec: Record<string, unknown> = {
        page_id: params.creative.pageId ?? '',
      };

      if (params.creative.videoId) {
        objectStorySpec.video_data = {
          ...(params.creative.thumbnailUrl && {
            image_url: params.creative.thumbnailUrl,
          }),
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
      } else {
        objectStorySpec.link_data = linkData;
      }
      const creativeSpec = { object_story_spec: objectStorySpec };

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
      if (!imageData?.hash || !imageData.url) {
        throw new Error('Meta did not return a usable uploaded image.');
      }
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
