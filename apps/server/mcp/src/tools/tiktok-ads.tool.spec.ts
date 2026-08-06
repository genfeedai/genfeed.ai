import type { ClientService } from '@mcp/services/client.service';
import { handleTikTokAdsTool } from '@mcp/tools/tiktok-ads.tool';

function buildClient() {
  return {
    getTikTokCampaignInsights: vi
      .fn()
      .mockResolvedValue({ ctr: 1.2, spend: 42 }),
    getTikTokTopPerformers: vi
      .fn()
      .mockResolvedValue([{ metric: 'ctr', name: '2026-08-01', value: 3.1 }]),
    listTikTokAdAccounts: vi
      .fn()
      .mockResolvedValue([{ id: 'advertiser-1', name: 'Main advertiser' }]),
    listTikTokAdGroups: vi
      .fn()
      .mockResolvedValue([{ id: 'adgroup-1', name: 'Prospecting' }]),
    listTikTokAds: vi.fn().mockResolvedValue([{ id: 'ad-1', name: 'Hook A' }]),
    listTikTokCampaigns: vi
      .fn()
      .mockResolvedValue([{ id: 'campaign-1', name: 'Launch' }]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleTikTokAdsTool(client as unknown as ClientService, name, args);
}

describe('handleTikTokAdsTool', () => {
  it('lists advertiser accounts for a credential', async () => {
    const client = buildClient();

    const result = await call(client, 'list_tiktok_ad_accounts', {
      credentialId: 'credential-1',
    });

    expect(client.listTikTokAdAccounts).toHaveBeenCalledWith('credential-1');
    expect(result.content[0].text).toContain('advertiser-1');
  });

  it('lists campaigns scoped to a credential and advertiser account', async () => {
    const client = buildClient();

    const result = await call(client, 'list_tiktok_campaigns', {
      adAccountId: 'advertiser-1',
      credentialId: 'credential-1',
    });

    expect(client.listTikTokCampaigns).toHaveBeenCalledWith(
      'credential-1',
      'advertiser-1',
    );
    expect(result.content[0].text).toContain('campaign-1');
  });

  it('forwards the full date range to campaign insights', async () => {
    const client = buildClient();

    const result = await call(client, 'get_tiktok_campaign_insights', {
      adAccountId: 'advertiser-1',
      campaignId: 'campaign-1',
      credentialId: 'credential-1',
      datePreset: 'last_7d',
      since: '2026-08-01',
      until: '2026-08-06',
    });

    expect(client.getTikTokCampaignInsights).toHaveBeenCalledWith(
      'credential-1',
      'advertiser-1',
      'campaign-1',
      'last_7d',
      '2026-08-01',
      '2026-08-06',
    );
    expect(result.content[0].text).toContain('TikTok Campaign Insights');
  });

  it('forwards ranking options to top performers', async () => {
    const client = buildClient();

    await call(client, 'get_tiktok_top_performers', {
      adAccountId: 'advertiser-1',
      credentialId: 'credential-1',
      datePreset: 'last_30d',
      limit: 5,
      metric: 'ctr',
    });

    expect(client.getTikTokTopPerformers).toHaveBeenCalledWith(
      'credential-1',
      'advertiser-1',
      'ctr',
      5,
      'last_30d',
    );
  });

  it('lists ad groups within a campaign', async () => {
    const client = buildClient();

    const result = await call(client, 'list_tiktok_adgroups', {
      adAccountId: 'advertiser-1',
      campaignId: 'campaign-1',
      credentialId: 'credential-1',
    });

    expect(client.listTikTokAdGroups).toHaveBeenCalledWith(
      'credential-1',
      'advertiser-1',
      'campaign-1',
    );
    expect(result.content[0].text).toContain('adgroup-1');
  });

  it('lists ads without an ad group filter', async () => {
    const client = buildClient();

    await call(client, 'list_tiktok_ads', {
      adAccountId: 'advertiser-1',
      credentialId: 'credential-1',
    });

    expect(client.listTikTokAds).toHaveBeenCalledWith(
      'credential-1',
      'advertiser-1',
      undefined,
    );
  });

  it('reports an empty result instead of an empty list dump', async () => {
    const client = buildClient();
    client.listTikTokCampaigns.mockResolvedValue([]);

    const result = await call(client, 'list_tiktok_campaigns', {
      adAccountId: 'advertiser-1',
      credentialId: 'credential-1',
    });

    expect(result.content[0].text).toBe('No TikTok campaigns found.');
  });

  it('rejects an unknown TikTok tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'get_tiktok_nonexistent', {})).toThrow(
      /Unknown TikTok Ads tool: get_tiktok_nonexistent/,
    );
  });
});
