import type { ClientService } from '@mcp/services/client.service';
import { handleMetaAdsTool } from '@mcp/tools/meta-ads.tool';

function buildClient() {
  return {
    compareMetaCampaigns: vi
      .fn()
      .mockResolvedValue([{ id: 'campaign-1', spend: 120 }]),
    getMetaAdInsights: vi.fn().mockResolvedValue({ clicks: 44, spend: 12 }),
    getMetaAdSetInsights: vi.fn().mockResolvedValue({ reach: 900, spend: 30 }),
    getMetaCampaignInsights: vi
      .fn()
      .mockResolvedValue({ impressions: 5000, spend: 120 }),
    getMetaTopPerformers: vi
      .fn()
      .mockResolvedValue([{ name: 'Hook A', value: 3.4 }]),
    listMetaAdAccounts: vi
      .fn()
      .mockResolvedValue([{ id: 'act_1', name: 'Main account' }]),
    listMetaAdCreatives: vi
      .fn()
      .mockResolvedValue([{ id: 'creative-1', name: 'Summer hook' }]),
    listMetaCampaigns: vi
      .fn()
      .mockResolvedValue([{ id: 'campaign-1', name: 'Launch' }]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleMetaAdsTool(client as unknown as ClientService, name, args);
}

describe('handleMetaAdsTool', () => {
  it('lists ad accounts', async () => {
    const client = buildClient();

    const result = await call(client, 'list_meta_ad_accounts', {});

    expect(client.listMetaAdAccounts).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Found 1 ad accounts');
    expect(result.content[0].text).toContain('act_1');
  });

  it('explains the missing permission when no ad account is returned', async () => {
    const client = buildClient();
    client.listMetaAdAccounts.mockResolvedValue([]);

    const result = await call(client, 'list_meta_ad_accounts', {});

    expect(result.content[0].text).toContain('No Meta ad accounts found');
    expect(result.content[0].text).toContain('ads_management');
  });

  it('lists campaigns with the status and limit filters applied', async () => {
    const client = buildClient();

    const result = await call(client, 'list_meta_campaigns', {
      adAccountId: 'act_1',
      limit: 10,
      status: 'ACTIVE',
    });

    expect(client.listMetaCampaigns).toHaveBeenCalledWith(
      'act_1',
      'ACTIVE',
      10,
    );
    expect(result.content[0].text).toContain('Found 1 campaigns');
  });

  it('reports an empty campaign list instead of dumping an empty array', async () => {
    const client = buildClient();
    client.listMetaCampaigns.mockResolvedValue([]);

    const result = await call(client, 'list_meta_campaigns', {
      adAccountId: 'act_1',
    });

    expect(client.listMetaCampaigns).toHaveBeenCalledWith(
      'act_1',
      undefined,
      undefined,
    );
    expect(result.content[0].text).toBe('No campaigns found.');
  });

  it('lists ad creatives', async () => {
    const client = buildClient();

    const result = await call(client, 'list_meta_ad_creatives', {
      adAccountId: 'act_1',
      limit: 25,
    });

    expect(client.listMetaAdCreatives).toHaveBeenCalledWith('act_1', 25);
    expect(result.content[0].text).toContain('Found 1 creatives');
  });

  it('reports an empty creative list', async () => {
    const client = buildClient();
    client.listMetaAdCreatives.mockResolvedValue([]);

    const result = await call(client, 'list_meta_ad_creatives', {
      adAccountId: 'act_1',
    });

    expect(result.content[0].text).toBe('No ad creatives found.');
  });

  it('forwards the full date range to campaign insights', async () => {
    const client = buildClient();

    const result = await call(client, 'get_meta_campaign_insights', {
      campaignId: 'campaign-1',
      datePreset: 'last_7d',
      since: '2026-08-01',
      until: '2026-08-06',
    });

    expect(client.getMetaCampaignInsights).toHaveBeenCalledWith(
      'campaign-1',
      'last_7d',
      '2026-08-01',
      '2026-08-06',
    );
    expect(result.content[0].text).toContain('Campaign Insights');
    expect(result.content[0].text).toContain('impressions');
  });

  it('forwards the date preset to ad set insights', async () => {
    const client = buildClient();

    const result = await call(client, 'get_meta_adset_insights', {
      adSetId: 'adset-1',
      datePreset: 'last_30d',
    });

    expect(client.getMetaAdSetInsights).toHaveBeenCalledWith(
      'adset-1',
      'last_30d',
    );
    expect(result.content[0].text).toContain('Ad Set Insights');
  });

  it('forwards the date preset to ad insights', async () => {
    const client = buildClient();

    const result = await call(client, 'get_meta_ad_insights', {
      adId: 'ad-1',
    });

    expect(client.getMetaAdInsights).toHaveBeenCalledWith('ad-1', undefined);
    expect(result.content[0].text).toContain('Ad Insights');
  });

  it('labels top performers with the ranking metric', async () => {
    const client = buildClient();

    const result = await call(client, 'get_meta_top_performers', {
      adAccountId: 'act_1',
      limit: 5,
      metric: 'ctr',
    });

    expect(client.getMetaTopPerformers).toHaveBeenCalledWith('act_1', 'ctr', 5);
    expect(result.content[0].text).toContain('Top Performers by ctr');
  });

  it('compares several campaigns at once', async () => {
    const client = buildClient();

    const result = await call(client, 'compare_meta_campaigns', {
      campaignIds: ['campaign-1', 'campaign-2'],
      datePreset: 'last_14d',
    });

    expect(client.compareMetaCampaigns).toHaveBeenCalledWith(
      ['campaign-1', 'campaign-2'],
      'last_14d',
    );
    expect(result.content[0].text).toContain('Campaign Comparison');
  });

  it('rejects an unknown Meta tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'get_meta_nonexistent', {})).toThrow(
      /Unknown Meta Ads tool: get_meta_nonexistent/,
    );
  });
});
