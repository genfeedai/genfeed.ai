import type { BaseApiClient } from './base-api-client';

/** Meta Ads, Google Ads, and ad-insights (content-loop) read/generate methods. */
export class AdsClient {
  constructor(private readonly base: BaseApiClient) {}

  // ── Meta Ads ──

  listMetaAdAccounts(): Promise<unknown[]> {
    return this.base.request(
      'listing Meta ad accounts',
      async (http) =>
        this.base.unwrapList(await http.get('/integrations/meta-ads/accounts')),
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
          await http.get('/integrations/meta-ads/campaigns', {
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
            `/integrations/meta-ads/campaigns/${campaignId}/insights`,
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
          await http.get(`/integrations/meta-ads/adsets/${adSetId}/insights`, {
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
          await http.get(`/integrations/meta-ads/ads/${adId}/insights`, {
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
          await http.get('/integrations/meta-ads/creatives', {
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
          await http.get('/integrations/meta-ads/campaigns/compare', {
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
          await http.get('/integrations/meta-ads/top-performers', {
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
        this.base.unwrapList(
          await http.get('/integrations/google-ads/customers'),
        ),
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
          await http.get('/integrations/google-ads/campaigns', {
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
            `/integrations/google-ads/campaigns/${campaignId}/metrics`,
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
            `/integrations/google-ads/ad-groups/${adGroupId}/insights`,
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
          await http.get('/integrations/google-ads/keywords', {
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
          await http.get(
            `/integrations/google-ads/search-terms/${campaignId}`,
            {
              params: {
                customerId,
                endDate,
                limit,
                loginCustomerId,
                startDate,
              },
            },
          ),
        ),
      this.base.failWith('Failed to get Google Ads search terms'),
    );
  }

  // ── Ad Insights (Content Loop) ──

  getAdPerformanceInsights(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown> {
    return this.base.request(
      'getting ad performance insights',
      async (http) =>
        this.base.unwrapData(
          await http.get('/ad-insights/benchmarks', { params }),
        ),
      this.base.failWith('Failed to get ad performance insights'),
    );
  }

  getTopHeadlines(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown[]> {
    return this.base.request(
      'getting top headlines',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ad-insights/top-headlines', { params }),
        ),
      this.base.failWith('Failed to get top headlines'),
    );
  }

  suggestAdHeadlines(params: {
    industry?: string;
    platform?: string;
    product?: string;
  }): Promise<unknown> {
    return this.base.request(
      'suggesting ad headlines',
      async (http) =>
        this.base.unwrapData(
          await http.post('/ad-insights/suggest-headlines', params),
        ),
      this.base.failWith('Failed to suggest ad headlines'),
    );
  }

  generateAdVariations(params: {
    headline?: string;
    body?: string;
    platform?: string;
    count?: number;
  }): Promise<unknown> {
    return this.base.request(
      'generating ad variations',
      async (http) =>
        this.base.unwrapData(
          await http.post('/ad-insights/generate-variations', params),
        ),
      this.base.failWith('Failed to generate ad variations'),
    );
  }

  benchmarkAdPerformance(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown> {
    return this.base.request(
      'benchmarking ad performance',
      async (http) =>
        this.base.unwrapData(
          await http.get('/ad-insights/benchmarks', { params }),
        ),
      this.base.failWith('Failed to benchmark ad performance'),
    );
  }
}
