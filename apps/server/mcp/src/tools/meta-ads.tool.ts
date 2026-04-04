import type { ClientService } from '@mcp/services/client.service';

export function handleMetaAdsTool(
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
    compare_meta_campaigns: async (a) => {
      const result = await client.compareMetaCampaigns(
        a.campaignIds as string[],
        a.datePreset as string | undefined,
      );
      return {
        content: [
          {
            text: `Campaign Comparison:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_meta_ad_insights: async (a) => {
      const result = await client.getMetaAdInsights(
        a.adId as string,
        a.datePreset as string | undefined,
      );
      return {
        content: [
          {
            text: `Ad Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_meta_adset_insights: async (a) => {
      const result = await client.getMetaAdSetInsights(
        a.adSetId as string,
        a.datePreset as string | undefined,
      );
      return {
        content: [
          {
            text: `Ad Set Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_meta_campaign_insights: async (a) => {
      const result = await client.getMetaCampaignInsights(
        a.campaignId as string,
        a.datePreset as string | undefined,
        a.since as string | undefined,
        a.until as string | undefined,
      );
      return {
        content: [
          {
            text: `Campaign Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_meta_top_performers: async (a) => {
      const result = await client.getMetaTopPerformers(
        a.adAccountId as string,
        a.metric as string,
        a.limit as number | undefined,
      );
      return {
        content: [
          {
            text: `Top Performers by ${a.metric}:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    list_meta_ad_accounts: async () => {
      const result = await client.listMetaAdAccounts();
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} ad accounts:\n\n${JSON.stringify(result, null, 2)}`
                : 'No Meta ad accounts found. Make sure your Facebook account has ads_management permission.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_meta_ad_creatives: async (a) => {
      const result = await client.listMetaAdCreatives(
        a.adAccountId as string,
        a.limit as number | undefined,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} creatives:\n\n${JSON.stringify(result, null, 2)}`
                : 'No ad creatives found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_meta_campaigns: async (a) => {
      const result = await client.listMetaCampaigns(
        a.adAccountId as string,
        a.status as string | undefined,
        a.limit as number | undefined,
      );
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} campaigns:\n\n${JSON.stringify(result, null, 2)}`
                : 'No campaigns found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown Meta Ads tool: ${name}`);
  return handler(args);
}
