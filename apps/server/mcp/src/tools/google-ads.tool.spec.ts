import type { ClientService } from '@mcp/services/client.service';
import { handleGoogleAdsTool } from '@mcp/tools/google-ads.tool';

function buildClient() {
  return {
    getGoogleAdsAdGroupInsights: vi
      .fn()
      .mockResolvedValue({ clicks: 120, cost: 45 }),
    getGoogleAdsCampaignMetrics: vi
      .fn()
      .mockResolvedValue({ conversions: 12, impressions: 9000 }),
    getGoogleAdsKeywordPerformance: vi
      .fn()
      .mockResolvedValue([{ clicks: 30, keyword: 'ai video' }]),
    getGoogleAdsSearchTerms: vi
      .fn()
      .mockResolvedValue([{ impressions: 400, term: 'ai video editor' }]),
    listGoogleAdsCampaigns: vi
      .fn()
      .mockResolvedValue([{ id: 'campaign-1', name: 'Search — brand' }]),
    listGoogleAdsCustomers: vi
      .fn()
      .mockResolvedValue([{ id: '123-456', name: 'Genfeed' }]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleGoogleAdsTool(client as unknown as ClientService, name, args);
}

describe('handleGoogleAdsTool', () => {
  it('lists accessible customer accounts', async () => {
    const client = buildClient();

    const result = await call(client, 'list_google_ads_customers', {});

    expect(client.listGoogleAdsCustomers).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Found 1 Google Ads accounts');
    expect(result.content[0].text).toContain('123-456');
  });

  it('reports an empty customer list instead of dumping an empty array', async () => {
    const client = buildClient();
    client.listGoogleAdsCustomers.mockResolvedValue([]);

    const result = await call(client, 'list_google_ads_customers', {});

    expect(result.content[0].text).toBe('No Google Ads accounts found.');
  });

  it('lists campaigns with status, limit and the manager account', async () => {
    const client = buildClient();

    const result = await call(client, 'list_google_ads_campaigns', {
      customerId: '123-456',
      limit: 20,
      loginCustomerId: '999-888',
      status: 'ENABLED',
    });

    expect(client.listGoogleAdsCampaigns).toHaveBeenCalledWith(
      '123-456',
      'ENABLED',
      20,
      '999-888',
    );
    expect(result.content[0].text).toContain('Found 1 campaigns');
  });

  it('reports an empty campaign list', async () => {
    const client = buildClient();
    client.listGoogleAdsCampaigns.mockResolvedValue([]);

    const result = await call(client, 'list_google_ads_campaigns', {
      customerId: '123-456',
    });

    expect(client.listGoogleAdsCampaigns).toHaveBeenCalledWith(
      '123-456',
      undefined,
      undefined,
      undefined,
    );
    expect(result.content[0].text).toBe('No campaigns found.');
  });

  it('forwards the date range and segmentation to campaign metrics', async () => {
    const client = buildClient();

    const result = await call(client, 'get_google_ads_campaign_metrics', {
      campaignId: 'campaign-1',
      customerId: '123-456',
      endDate: '2026-08-07',
      loginCustomerId: '999-888',
      segmentByDate: true,
      startDate: '2026-08-01',
    });

    expect(client.getGoogleAdsCampaignMetrics).toHaveBeenCalledWith(
      '123-456',
      'campaign-1',
      '2026-08-01',
      '2026-08-07',
      true,
      '999-888',
    );
    expect(result.content[0].text).toContain('Campaign Metrics');
    expect(result.content[0].text).toContain('conversions');
  });

  it('forwards the date range to ad group insights', async () => {
    const client = buildClient();

    const result = await call(client, 'get_google_ads_adgroup_insights', {
      adGroupId: 'adgroup-1',
      customerId: '123-456',
      endDate: '2026-08-07',
      startDate: '2026-08-01',
    });

    expect(client.getGoogleAdsAdGroupInsights).toHaveBeenCalledWith(
      '123-456',
      'adgroup-1',
      '2026-08-01',
      '2026-08-07',
      undefined,
    );
    expect(result.content[0].text).toContain('Ad Group Insights');
  });

  it('forwards the limit to keyword performance', async () => {
    const client = buildClient();

    const result = await call(client, 'get_google_ads_keyword_performance', {
      customerId: '123-456',
      limit: 50,
    });

    expect(client.getGoogleAdsKeywordPerformance).toHaveBeenCalledWith(
      '123-456',
      undefined,
      undefined,
      50,
      undefined,
    );
    expect(result.content[0].text).toContain('Keyword Performance');
  });

  it('scopes the search terms report to a campaign', async () => {
    const client = buildClient();

    const result = await call(client, 'get_google_ads_search_terms', {
      campaignId: 'campaign-1',
      customerId: '123-456',
      endDate: '2026-08-07',
      limit: 100,
      loginCustomerId: '999-888',
      startDate: '2026-08-01',
    });

    expect(client.getGoogleAdsSearchTerms).toHaveBeenCalledWith(
      '123-456',
      'campaign-1',
      '2026-08-01',
      '2026-08-07',
      100,
      '999-888',
    );
    expect(result.content[0].text).toContain('Search Terms Report');
  });

  it('rejects an unknown Google Ads tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'get_google_ads_nonexistent', {})).toThrow(
      /Unknown Google Ads tool: get_google_ads_nonexistent/,
    );
  });
});
