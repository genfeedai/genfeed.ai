import type { ClientService } from '@mcp/services/client.service';

export function handleGoogleAdsTool(
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
    get_google_ads_adgroup_insights: async (a) => {
      const result = await client.getGoogleAdsAdGroupInsights(
        a.customerId as string,
        a.adGroupId as string,
        a.startDate as string | undefined,
        a.endDate as string | undefined,
        a.loginCustomerId as string | undefined,
      );
      return {
        content: [
          {
            text: `Ad Group Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_google_ads_campaign_metrics: async (a) => {
      const result = await client.getGoogleAdsCampaignMetrics(
        a.customerId as string,
        a.campaignId as string,
        a.startDate as string | undefined,
        a.endDate as string | undefined,
        a.segmentByDate as boolean | undefined,
        a.loginCustomerId as string | undefined,
      );
      return {
        content: [
          {
            text: `Campaign Metrics:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_google_ads_keyword_performance: async (a) => {
      const result = await client.getGoogleAdsKeywordPerformance(
        a.customerId as string,
        a.startDate as string | undefined,
        a.endDate as string | undefined,
        a.limit as number | undefined,
        a.loginCustomerId as string | undefined,
      );
      return {
        content: [
          {
            text: `Keyword Performance:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_google_ads_search_terms: async (a) => {
      const result = await client.getGoogleAdsSearchTerms(
        a.customerId as string,
        a.campaignId as string,
        a.startDate as string | undefined,
        a.endDate as string | undefined,
        a.limit as number | undefined,
        a.loginCustomerId as string | undefined,
      );
      return {
        content: [
          {
            text: `Search Terms Report:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    list_google_ads_campaigns: async (a) => {
      const result = await client.listGoogleAdsCampaigns(
        a.customerId as string,
        a.status as string | undefined,
        a.limit as number | undefined,
        a.loginCustomerId as string | undefined,
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
    list_google_ads_customers: async () => {
      const result = await client.listGoogleAdsCustomers();
      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} Google Ads accounts:\n\n${JSON.stringify(result, null, 2)}`
                : 'No Google Ads accounts found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown Google Ads tool: ${name}`);
  return handler(args);
}
