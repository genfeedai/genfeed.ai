import type { BaseApiClient } from './base-api-client';
import type { AdsGatewayInsightsParams } from './client.types';

/**
 * Meta Ads and Google Ads read methods, plus the platform-generic ads gateway.
 *
 * Meta/Google paths target the API's `services/*-ads/*` controllers (not
 * `integrations/*`). Those controllers live at
 * `apps/server/api/src/services/integrations/{meta,google}-ads` but are mounted
 * under `@Controller('services/meta-ads')` / `@Controller('services/google-ads')`,
 * so the proxy path segment is `services`.
 *
 * Ad-set and ad level insights go through the gateway at `@Controller('ads')`
 * → `/ads/:platform/*` instead, because that surface is backed by the shared
 * `IAdsAdapter` contract and therefore works for every supported platform
 * rather than only the two with dedicated controllers.
 */
export class AdsClient {
  constructor(private readonly base: BaseApiClient) {}

  // ── Meta Ads ──

  listMetaAdAccounts(): Promise<unknown[]> {
    return this.base.request(
      'listing Meta ad accounts',
      async (http) =>
        this.base.unwrapList(await http.get('/services/meta-ads/accounts')),
      this.base.failWith('Failed to list Meta ad accounts'),
    );
  }

  listMetaCampaigns(
    adAccountId: string,
    status?: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing Meta campaigns',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/campaigns', {
            params: { adAccountId, limit, status },
          }),
        ),
      this.base.failWith('Failed to list Meta campaigns'),
    );
  }

  getMetaCampaignInsights(
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Meta campaign insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/meta-ads/campaigns/${campaignId}/insights`,
            { params: { datePreset, since, until } },
          ),
        ),
      this.base.failWith('Failed to get Meta campaign insights'),
    );
  }

  getMetaAdSetInsights(adSetId: string, datePreset?: string): Promise<unknown> {
    return this.base.request(
      'getting Meta ad set insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(`/services/meta-ads/adsets/${adSetId}/insights`, {
            params: { datePreset },
          }),
        ),
      this.base.failWith('Failed to get Meta ad set insights'),
    );
  }

  getMetaAdInsights(adId: string, datePreset?: string): Promise<unknown> {
    return this.base.request(
      'getting Meta ad insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(`/services/meta-ads/ads/${adId}/insights`, {
            params: { datePreset },
          }),
        ),
      this.base.failWith('Failed to get Meta ad insights'),
    );
  }

  listMetaAdCreatives(adAccountId: string, limit?: number): Promise<unknown[]> {
    return this.base.request(
      'listing Meta ad creatives',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/creatives', {
            params: { adAccountId, limit },
          }),
        ),
      this.base.failWith('Failed to list Meta ad creatives'),
    );
  }

  compareMetaCampaigns(
    campaignIds: string[],
    datePreset?: string,
  ): Promise<unknown> {
    return this.base.request(
      'comparing Meta campaigns',
      async (http) =>
        this.base.unwrapData(
          await http.get('/services/meta-ads/campaigns/compare', {
            params: { campaignIds: campaignIds.join(','), datePreset },
          }),
        ),
      this.base.failWith('Failed to compare Meta campaigns'),
    );
  }

  getMetaTopPerformers(
    adAccountId: string,
    metric: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Meta top performers',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/top-performers', {
            params: { adAccountId, limit, metric },
          }),
        ),
      this.base.failWith('Failed to get Meta top performers'),
    );
  }

  // ── Google Ads ──

  listGoogleAdsCustomers(): Promise<unknown[]> {
    return this.base.request(
      'listing Google Ads customers',
      async (http) =>
        this.base.unwrapList(await http.get('/services/google-ads/customers')),
      this.base.failWith('Failed to list Google Ads customers'),
    );
  }

  listGoogleAdsCampaigns(
    customerId: string,
    status?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing Google Ads campaigns',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/google-ads/campaigns', {
            params: { customerId, limit, loginCustomerId, status },
          }),
        ),
      this.base.failWith('Failed to list Google Ads campaigns'),
    );
  }

  getGoogleAdsCampaignMetrics(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    segmentByDate?: boolean,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Google Ads campaign metrics',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/google-ads/campaigns/${campaignId}/metrics`,
            {
              params: {
                customerId,
                endDate,
                loginCustomerId,
                segmentByDate,
                startDate,
              },
            },
          ),
        ),
      this.base.failWith('Failed to get Google Ads campaign metrics'),
    );
  }

  getGoogleAdsAdGroupInsights(
    customerId: string,
    adGroupId: string,
    startDate?: string,
    endDate?: string,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Google Ads ad group insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/google-ads/ad-groups/${adGroupId}/insights`,
            {
              params: { customerId, endDate, loginCustomerId, startDate },
            },
          ),
        ),
      this.base.failWith('Failed to get Google Ads ad group insights'),
    );
  }

  getGoogleAdsKeywordPerformance(
    customerId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Google Ads keyword performance',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/google-ads/keywords', {
            params: { customerId, endDate, limit, loginCustomerId, startDate },
          }),
        ),
      this.base.failWith('Failed to get Google Ads keyword performance'),
    );
  }

  getGoogleAdsSearchTerms(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Google Ads search terms',
      async (http) =>
        this.base.unwrapList(
          await http.get(`/services/google-ads/search-terms/${campaignId}`, {
            params: {
              customerId,
              endDate,
              limit,
              loginCustomerId,
              startDate,
            },
          }),
        ),
      this.base.failWith('Failed to get Google Ads search terms'),
    );
  }

  // ── Ads gateway (platform-generic, `/ads/:platform/*`) ──

  getAdsAdSetInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.base.request(
      'getting ad set insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/ads/${params.platform}/adsets/${params.entityId}/insights`,
            { params: this.toGatewayQuery(params) },
          ),
        ),
      this.base.failWith('Failed to get ad set insights'),
    );
  }

  getAdsAdInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.base.request(
      'getting ad insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/ads/${params.platform}/ads/${params.entityId}/insights`,
            { params: this.toGatewayQuery(params) },
          ),
        ),
      this.base.failWith('Failed to get ad insights'),
    );
  }

  private toGatewayQuery(
    params: AdsGatewayInsightsParams,
  ): Record<string, string | undefined> {
    return {
      adAccountId: params.adAccountId,
      credentialId: params.credentialId,
      datePreset: params.datePreset,
      loginCustomerId: params.loginCustomerId,
      since: params.since,
      until: params.until,
    };
  }
}
