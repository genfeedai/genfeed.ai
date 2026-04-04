import { ConfigService } from '@api/config/config.service';
import type {
  GoogleAdsAd,
  GoogleAdsAdGroup,
  GoogleAdsAdGroupInsights,
  GoogleAdsCampaign,
  GoogleAdsCampaignMetrics,
  GoogleAdsCreateAdGroupInput,
  GoogleAdsCreateResponsiveSearchAdInput,
  GoogleAdsCustomer,
  GoogleAdsKeywordPerformance,
  GoogleAdsMetricsParams,
  GoogleAdsSearchTerm,
  GoogleAdsUpdateCampaignInput,
} from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GoogleAdsService {
  private readonly API_VERSION = 'v18';
  private readonly BASE_URL = 'https://googleads.googleapis.com';
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  private getHeaders(
    accessToken: string,
    loginCustomerId?: string,
  ): Record<string, string> {
    const developerToken = this.configService.get('GOOGLE_ADS_DEVELOPER_TOKEN');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'developer-token': developerToken || '',
    };
    if (loginCustomerId) {
      headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
    }
    return headers;
  }

  private async executeGaql<T>(
    accessToken: string,
    customerId: string,
    query: string,
    loginCustomerId?: string,
  ): Promise<T[]> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/customers/${customerId.replace(/-/g, '')}/googleAds:searchStream`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.post<Array<{ results: T[] }>>(
            url,
            { query },
            {
              headers: this.getHeaders(accessToken, loginCustomerId),
              timeout: 30000,
            },
          ),
        );

        return response.data.flatMap((batch) => batch.results || []);
      } catch (error: unknown) {
        lastError = error as Error;
        const status = (error as { response?: { status?: number } })?.response
          ?.status;

        if (status === 401) {
          throw error;
        }

        if (status === 429) {
          const delay = 2 ** attempt * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (attempt < this.MAX_RETRIES - 1) {
          const delay = 2 ** attempt * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Google Ads API request failed');
  }

  private async executeMutate(
    accessToken: string,
    customerId: string,
    mutateOperations: Array<Record<string, unknown>>,
    loginCustomerId?: string,
  ): Promise<{ mutateOperationResponses?: Array<Record<string, unknown>> }> {
    const url = `${this.BASE_URL}/${this.API_VERSION}/customers/${customerId.replace(/-/g, '')}/googleAds:mutate`;

    const response = await firstValueFrom(
      this.httpService.post<{
        mutateOperationResponses?: Array<Record<string, unknown>>;
      }>(
        url,
        {
          mutateOperations,
          partialFailure: false,
          validateOnly: false,
        },
        {
          headers: this.getHeaders(accessToken, loginCustomerId),
          timeout: 30000,
        },
      ),
    );

    return response.data;
  }

  private parseIdFromResourceName(resourceName?: string): string {
    if (!resourceName) {
      return '';
    }

    const segments = resourceName.split('/');
    return segments[segments.length - 1] || '';
  }

  async listAccessibleCustomers(
    accessToken: string,
  ): Promise<GoogleAdsCustomer[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const url = `${this.BASE_URL}/${this.API_VERSION}/customers:listAccessibleCustomers`;
      const developerToken = this.configService.get(
        'GOOGLE_ADS_DEVELOPER_TOKEN',
      );

      const response = await firstValueFrom(
        this.httpService.get<{ resourceNames: string[] }>(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developerToken || '',
          },
          timeout: 10000,
        }),
      );

      const customers: GoogleAdsCustomer[] = [];
      for (const resourceName of response.data.resourceNames) {
        const customerId = resourceName.replace('customers/', '');
        try {
          const details = await this.executeGaql<{
            customer: {
              id: string;
              descriptiveName: string;
              currencyCode: string;
              timeZone: string;
              manager: boolean;
            };
          }>(
            accessToken,
            customerId,
            `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1`,
          );
          if (details[0]) {
            customers.push({
              currencyCode: details[0].customer.currencyCode,
              descriptiveName: details[0].customer.descriptiveName,
              id: details[0].customer.id,
              isManager: details[0].customer.manager,
              timeZone: details[0].customer.timeZone,
            });
          }
        } catch {
          this.loggerService.warn(
            `${this.constructorName}: Could not fetch details for customer ${customerId}`,
          );
        }
      }

      return customers;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listCampaigns(
    accessToken: string,
    customerId: string,
    params?: { status?: string; limit?: number },
    loginCustomerId?: string,
  ): Promise<GoogleAdsCampaign[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, campaign.start_date, campaign.end_date FROM campaign`;
      if (params?.status) {
        query += ` WHERE campaign.status = '${params.status}'`;
      }
      query += ` ORDER BY campaign.name`;
      if (params?.limit) {
        query += ` LIMIT ${params.limit}`;
      }

      const results = await this.executeGaql<{
        campaign: {
          id: string;
          name: string;
          status: string;
          advertisingChannelType: string;
          startDate?: string;
          endDate?: string;
        };
        campaignBudget?: { amountMicros?: string };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((r) => ({
        advertisingChannelType: r.campaign.advertisingChannelType,
        budgetAmountMicros: r.campaignBudget?.amountMicros,
        endDate: r.campaign.endDate,
        id: r.campaign.id,
        name: r.campaign.name,
        startDate: r.campaign.startDate,
        status: r.campaign.status,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getCampaign(
    accessToken: string,
    customerId: string,
    campaignId: string,
    loginCustomerId?: string,
  ): Promise<GoogleAdsCampaign | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.start_date, campaign.end_date, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`;

      const results = await this.executeGaql<{
        campaign: {
          id: string;
          name: string;
          status: string;
          advertisingChannelType: string;
          startDate?: string;
          endDate?: string;
        };
        campaignBudget?: { amountMicros?: string };
      }>(accessToken, customerId, query, loginCustomerId);

      const row = results[0];
      if (!row) {
        return null;
      }

      return {
        advertisingChannelType: row.campaign.advertisingChannelType,
        budgetAmountMicros: row.campaignBudget?.amountMicros,
        endDate: row.campaign.endDate,
        id: row.campaign.id,
        name: row.campaign.name,
        startDate: row.campaign.startDate,
        status: row.campaign.status,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async updateCampaign(
    accessToken: string,
    customerId: string,
    campaignId: string,
    input: GoogleAdsUpdateCampaignInput,
    loginCustomerId?: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const normalizedCustomerId = customerId.replace(/-/g, '');
      const campaignResource = `customers/${normalizedCustomerId}/campaigns/${campaignId}`;
      const mutateOperations: Array<Record<string, unknown>> = [];

      const campaignUpdate: Record<string, unknown> = {
        resourceName: campaignResource,
      };
      const updateMaskPaths: string[] = [];

      if (input.name) {
        campaignUpdate.name = input.name;
        updateMaskPaths.push('name');
      }

      if (input.status) {
        campaignUpdate.status = input.status;
        updateMaskPaths.push('status');
      }

      if (updateMaskPaths.length > 0) {
        mutateOperations.push({
          campaignOperation: {
            update: campaignUpdate,
            updateMask: updateMaskPaths.join(','),
          },
        });
      }

      if (typeof input.dailyBudget === 'number') {
        const budgetQuery = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`;
        const budgetResults = await this.executeGaql<{
          campaign: { campaignBudget: string };
        }>(accessToken, customerId, budgetQuery, loginCustomerId);
        const budgetResourceName = budgetResults[0]?.campaign.campaignBudget;

        if (budgetResourceName) {
          mutateOperations.push({
            campaignBudgetOperation: {
              update: {
                amountMicros: Math.round(input.dailyBudget * 1_000_000),
                resourceName: budgetResourceName,
              },
              updateMask: 'amount_micros',
            },
          });
        }
      }

      if (mutateOperations.length === 0) {
        return;
      }

      await this.executeMutate(
        accessToken,
        customerId,
        mutateOperations,
        loginCustomerId,
      );
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async pauseCampaign(
    accessToken: string,
    customerId: string,
    campaignId: string,
    loginCustomerId?: string,
  ): Promise<void> {
    await this.updateCampaign(
      accessToken,
      customerId,
      campaignId,
      { status: 'PAUSED' },
      loginCustomerId,
    );
  }

  async getCampaignMetrics(
    accessToken: string,
    customerId: string,
    campaignId: string,
    params?: GoogleAdsMetricsParams,
    loginCustomerId?: string,
  ): Promise<GoogleAdsCampaignMetrics[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc, metrics.average_cpm`;
      if (params?.segmentByDate) {
        query += `, segments.date`;
      }
      query += ` FROM campaign WHERE campaign.id = ${campaignId}`;
      if (params?.dateRange) {
        query += ` AND segments.date BETWEEN '${params.dateRange.startDate}' AND '${params.dateRange.endDate}'`;
      }
      if (params?.segmentByDate) {
        query += ` ORDER BY segments.date DESC`;
      }
      if (params?.limit) {
        query += ` LIMIT ${params.limit}`;
      }

      const results = await this.executeGaql<{
        campaign: { id: string; name: string };
        metrics: {
          impressions: string;
          clicks: string;
          costMicros: string;
          conversions: number;
          conversionsValue: number;
          ctr: number;
          averageCpc: number;
          averageCpm: number;
        };
        segments?: { date: string };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((r) => ({
        averageCpc: r.metrics.averageCpc,
        averageCpm: r.metrics.averageCpm,
        campaignId: r.campaign.id,
        campaignName: r.campaign.name,
        clicks: Number(r.metrics.clicks),
        conversions: r.metrics.conversions,
        conversionsValue: r.metrics.conversionsValue,
        costMicros: Number(r.metrics.costMicros),
        ctr: r.metrics.ctr,
        date: r.segments?.date,
        impressions: Number(r.metrics.impressions),
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listAdGroups(
    accessToken: string,
    customerId: string,
    campaignId?: string,
    loginCustomerId?: string,
  ): Promise<GoogleAdsAdGroup[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.campaign, ad_group.cpc_bid_micros FROM ad_group`;
      if (campaignId) {
        query += ` WHERE campaign.id = ${campaignId}`;
      }
      query += ` ORDER BY ad_group.name`;

      const results = await this.executeGaql<{
        adGroup: {
          id: string;
          name: string;
          status: string;
          campaign: string;
          cpcBidMicros?: string;
        };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((row) => ({
        campaignId: this.parseIdFromResourceName(row.adGroup.campaign),
        cpcBidMicros: row.adGroup.cpcBidMicros,
        id: row.adGroup.id,
        name: row.adGroup.name,
        status: row.adGroup.status,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createAdGroup(
    accessToken: string,
    customerId: string,
    input: GoogleAdsCreateAdGroupInput,
    loginCustomerId?: string,
  ): Promise<GoogleAdsAdGroup> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const normalizedCustomerId = customerId.replace(/-/g, '');
      const campaignResource = `customers/${normalizedCustomerId}/campaigns/${input.campaignId}`;
      const mutateResponse = await this.executeMutate(
        accessToken,
        customerId,
        [
          {
            adGroupOperation: {
              create: {
                campaign: campaignResource,
                cpcBidMicros: input.cpcBidMicros,
                name: input.name,
                status: 'PAUSED',
                type: 'SEARCH_STANDARD',
              },
            },
          },
        ],
        loginCustomerId,
      );

      const response = mutateResponse.mutateOperationResponses?.[0] as
        | {
            adGroupResult?: { resourceName?: string };
          }
        | undefined;

      const id = this.parseIdFromResourceName(
        response?.adGroupResult?.resourceName,
      );

      return {
        campaignId: input.campaignId,
        cpcBidMicros:
          input.cpcBidMicros !== undefined
            ? String(input.cpcBidMicros)
            : undefined,
        id,
        name: input.name,
        status: 'PAUSED',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listAds(
    accessToken: string,
    customerId: string,
    adGroupId?: string,
    loginCustomerId?: string,
  ): Promise<GoogleAdsAd[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad`;
      if (adGroupId) {
        query += ` WHERE ad_group.id = ${adGroupId}`;
      }
      query += ` ORDER BY ad_group_ad.ad.id DESC`;

      const results = await this.executeGaql<{
        adGroup: { id: string };
        adGroupAd: {
          status: string;
          ad: {
            id: string;
            name: string;
            finalUrls?: string[];
            responsiveSearchAd?: {
              headlines?: Array<{ text?: string }>;
              descriptions?: Array<{ text?: string }>;
            };
          };
        };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((row) => ({
        adGroupId: row.adGroup.id,
        descriptions: (row.adGroupAd.ad.responsiveSearchAd?.descriptions || [])
          .map((description) => description.text || '')
          .filter(Boolean),
        finalUrls: row.adGroupAd.ad.finalUrls,
        headlines: (row.adGroupAd.ad.responsiveSearchAd?.headlines || [])
          .map((headline) => headline.text || '')
          .filter(Boolean),
        id: row.adGroupAd.ad.id,
        name: row.adGroupAd.ad.name,
        status: row.adGroupAd.status,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async createResponsiveSearchAd(
    accessToken: string,
    customerId: string,
    input: GoogleAdsCreateResponsiveSearchAdInput,
    loginCustomerId?: string,
  ): Promise<GoogleAdsAd> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const normalizedCustomerId = customerId.replace(/-/g, '');
      const adGroupResource = `customers/${normalizedCustomerId}/adGroups/${input.adGroupId}`;
      const mutateResponse = await this.executeMutate(
        accessToken,
        customerId,
        [
          {
            adGroupAdOperation: {
              create: {
                ad: {
                  finalUrls: [input.finalUrl],
                  name: input.name,
                  responsiveSearchAd: {
                    descriptions: input.descriptions.map((description) => ({
                      text: description,
                    })),
                    headlines: input.headlines.map((headline) => ({
                      text: headline,
                    })),
                  },
                },
                adGroup: adGroupResource,
                status: 'PAUSED',
              },
            },
          },
        ],
        loginCustomerId,
      );

      const response = mutateResponse.mutateOperationResponses?.[0] as
        | {
            adGroupAdResult?: { resourceName?: string };
          }
        | undefined;

      const id = this.parseIdFromResourceName(
        response?.adGroupAdResult?.resourceName,
      );

      return {
        adGroupId: input.adGroupId,
        descriptions: input.descriptions,
        finalUrls: [input.finalUrl],
        headlines: input.headlines,
        id,
        name: input.name,
        status: 'PAUSED',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getAdGroupInsights(
    accessToken: string,
    customerId: string,
    adGroupId: string,
    params?: GoogleAdsMetricsParams,
    loginCustomerId?: string,
  ): Promise<GoogleAdsAdGroupInsights[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT ad_group.id, ad_group.name, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM ad_group WHERE ad_group.id = ${adGroupId}`;
      if (params?.dateRange) {
        query += ` AND segments.date BETWEEN '${params.dateRange.startDate}' AND '${params.dateRange.endDate}'`;
      }

      const results = await this.executeGaql<{
        adGroup: { id: string; name: string };
        campaign: { name: string };
        metrics: {
          impressions: string;
          clicks: string;
          costMicros: string;
          conversions: number;
          ctr: number;
          averageCpc: number;
        };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((r) => ({
        adGroupId: r.adGroup.id,
        adGroupName: r.adGroup.name,
        averageCpc: r.metrics.averageCpc,
        campaignName: r.campaign.name,
        clicks: Number(r.metrics.clicks),
        conversions: r.metrics.conversions,
        costMicros: Number(r.metrics.costMicros),
        ctr: r.metrics.ctr,
        impressions: Number(r.metrics.impressions),
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getKeywordPerformance(
    accessToken: string,
    customerId: string,
    params?: GoogleAdsMetricsParams,
    loginCustomerId?: string,
  ): Promise<GoogleAdsKeywordPerformance[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc, ad_group_criterion.quality_info.quality_score FROM keyword_view`;
      const conditions: string[] = [];
      if (params?.dateRange) {
        conditions.push(
          `segments.date BETWEEN '${params.dateRange.startDate}' AND '${params.dateRange.endDate}'`,
        );
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ` ORDER BY metrics.impressions DESC`;
      if (params?.limit) {
        query += ` LIMIT ${params.limit}`;
      }

      const results = await this.executeGaql<{
        adGroupCriterion: {
          keyword: { text: string; matchType: string };
          qualityInfo?: { qualityScore: number };
        };
        metrics: {
          impressions: string;
          clicks: string;
          costMicros: string;
          conversions: number;
          ctr: number;
          averageCpc: number;
        };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((r) => ({
        averageCpc: r.metrics.averageCpc,
        clicks: Number(r.metrics.clicks),
        conversions: r.metrics.conversions,
        costMicros: Number(r.metrics.costMicros),
        ctr: r.metrics.ctr,
        impressions: Number(r.metrics.impressions),
        keywordText: r.adGroupCriterion.keyword.text,
        matchType: r.adGroupCriterion.keyword.matchType,
        qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getSearchTermsReport(
    accessToken: string,
    customerId: string,
    campaignId: string,
    params?: GoogleAdsMetricsParams,
    loginCustomerId?: string,
  ): Promise<GoogleAdsSearchTerm[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let query = `SELECT search_term_view.search_term, segments.keyword.info.text, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM search_term_view WHERE campaign.id = ${campaignId}`;
      if (params?.dateRange) {
        query += ` AND segments.date BETWEEN '${params.dateRange.startDate}' AND '${params.dateRange.endDate}'`;
      }
      query += ` ORDER BY metrics.impressions DESC`;
      if (params?.limit) {
        query += ` LIMIT ${params.limit}`;
      }

      const results = await this.executeGaql<{
        searchTermView: { searchTerm: string };
        segments: { keyword: { info: { text: string } } };
        metrics: {
          impressions: string;
          clicks: string;
          costMicros: string;
          conversions: number;
          ctr: number;
        };
      }>(accessToken, customerId, query, loginCustomerId);

      return results.map((r) => ({
        clicks: Number(r.metrics.clicks),
        conversions: r.metrics.conversions,
        costMicros: Number(r.metrics.costMicros),
        ctr: r.metrics.ctr,
        impressions: Number(r.metrics.impressions),
        keywordText: r.segments.keyword.info.text,
        searchTerm: r.searchTermView.searchTerm,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }
}
