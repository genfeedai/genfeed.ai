import type { ClientService } from '@mcp/services/client.service';

/**
 * TikTok Ads read tools. Unlike Meta and Google, TikTok has no per-platform
 * REST controller — these proxy the platform-generic ads gateway
 * (`/ads/tiktok/*`), which dispatches to `TikTokAdsAdapter`. Every call is
 * account-scoped, so `credentialId` identifies the connected TikTok credential
 * and `adAccountId` the advertiser account under it.
 */
export function handleTikTokAdsTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (
      args: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string; type: 'text' }> }>
  > = {
    get_tiktok_campaign_insights: async (a) => {
      const result = await client.getTikTokCampaignInsights(
        a.credentialId as string,
        a.adAccountId as string,
        a.campaignId as string,
        a.datePreset as string | undefined,
        a.since as string | undefined,
        a.until as string | undefined,
      );
      return {
        content: [
          {
            text: `TikTok Campaign Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_tiktok_top_performers: async (a) => {
      const result = await client.getTikTokTopPerformers(
        a.credentialId as string,
        a.adAccountId as string,
        a.metric as string | undefined,
        a.limit as number | undefined,
        a.datePreset as string | undefined,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} top-performing TikTok ads:\n\n${JSON.stringify(result, null, 2)}`
                : 'No TikTok top performers found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_tiktok_ad_accounts: async (a) => {
      const result = await client.listTikTokAdAccounts(
        a.credentialId as string,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} TikTok ad accounts:\n\n${JSON.stringify(result, null, 2)}`
                : 'No TikTok ad accounts found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_tiktok_adgroups: async (a) => {
      const result = await client.listTikTokAdGroups(
        a.credentialId as string,
        a.adAccountId as string,
        a.campaignId as string,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} TikTok ad groups:\n\n${JSON.stringify(result, null, 2)}`
                : 'No TikTok ad groups found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_tiktok_ads: async (a) => {
      const result = await client.listTikTokAds(
        a.credentialId as string,
        a.adAccountId as string,
        a.adGroupId as string | undefined,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} TikTok ads:\n\n${JSON.stringify(result, null, 2)}`
                : 'No TikTok ads found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_tiktok_campaigns: async (a) => {
      const result = await client.listTikTokCampaigns(
        a.credentialId as string,
        a.adAccountId as string,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} TikTok campaigns:\n\n${JSON.stringify(result, null, 2)}`
                : 'No TikTok campaigns found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown TikTok Ads tool: ${name}`);
  return handler(args);
}
