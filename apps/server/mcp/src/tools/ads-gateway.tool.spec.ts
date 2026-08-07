import type { ClientService } from '@mcp/services/client.service';
import { handleAdsGatewayTool } from '@mcp/tools/ads-gateway.tool';

function buildClient() {
  return {
    getAdsAdInsights: vi
      .fn()
      .mockResolvedValue({ clicks: 30, impressions: 1000, platform: 'meta' }),
    getAdsAdSetInsights: vi.fn().mockResolvedValue({
      clicks: 200,
      impressions: 4000,
      platform: 'tiktok',
    }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleAdsGatewayTool(client as unknown as ClientService, name, args);
}

describe('handleAdsGatewayTool', () => {
  it('maps adSetId to the generic entityId and forwards the date preset', async () => {
    const client = buildClient();

    const result = await call(client, 'get_ads_adset_insights', {
      adAccountId: 'acct-123',
      adSetId: 'ag-1',
      credentialId: 'credential-1',
      datePreset: 'last_14d',
      platform: 'tiktok',
    });

    expect(client.getAdsAdSetInsights).toHaveBeenCalledWith({
      adAccountId: 'acct-123',
      credentialId: 'credential-1',
      datePreset: 'last_14d',
      entityId: 'ag-1',
      loginCustomerId: undefined,
      platform: 'tiktok',
      since: undefined,
      until: undefined,
    });
    expect(result.content[0].text).toContain('Ad Set Insights (tiktok)');
    expect(result.content[0].text).toContain('4000');
  });

  it('maps adId to the generic entityId and forwards a custom time range', async () => {
    const client = buildClient();

    const result = await call(client, 'get_ads_ad_insights', {
      adAccountId: 'act_123456',
      adId: 'ad-1',
      credentialId: 'credential-1',
      platform: 'meta',
      since: '2026-03-01',
      until: '2026-03-14',
    });

    expect(client.getAdsAdInsights).toHaveBeenCalledWith({
      adAccountId: 'act_123456',
      credentialId: 'credential-1',
      datePreset: undefined,
      entityId: 'ad-1',
      loginCustomerId: undefined,
      platform: 'meta',
      since: '2026-03-01',
      until: '2026-03-14',
    });
    expect(result.content[0].text).toContain('Ad Insights (meta)');
  });

  it('forwards loginCustomerId for Google manager accounts', async () => {
    const client = buildClient();

    await call(client, 'get_ads_ad_insights', {
      adAccountId: '1234567890',
      adId: 'ad-9',
      credentialId: 'credential-1',
      loginCustomerId: '1112223334',
      platform: 'google',
    });

    expect(client.getAdsAdInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'ad-9',
        loginCustomerId: '1112223334',
        platform: 'google',
      }),
    );
  });

  it('rejects an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_an_ads_gateway_tool', {})).toThrow(
      /Unknown ads gateway tool/,
    );
  });
});
