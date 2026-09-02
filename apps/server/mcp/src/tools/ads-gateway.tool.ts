import type { AdsPlatform } from '@genfeedai/contracts/interfaces';
import type { AdsGatewayInsightsParams } from '@mcp/services/client/client.types';
import type { ClientService } from '@mcp/services/client.service';

/**
 * Platform-generic ads gateway tools.
 *
 * Unlike the Meta and Google tool files, these are backed by the shared
 * `IAdsAdapter` contract, so a single tool serves every supported platform via
 * the `platform` argument instead of one tool per platform per level.
 */
function toGatewayParams(
  args: Record<string, unknown>,
  entityKey: 'adId' | 'adSetId',
): AdsGatewayInsightsParams {
  return {
    adAccountId: args.adAccountId as string,
    credentialId: args.credentialId as string,
    datePreset: args.datePreset as string | undefined,
    entityId: args[entityKey] as string,
    loginCustomerId: args.loginCustomerId as string | undefined,
    platform: args.platform as AdsPlatform,
    since: args.since as string | undefined,
    until: args.until as string | undefined,
  };
}

export function handleAdsGatewayTool(
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
    get_ads_ad_insights: async (a) => {
      const result = await client.getAdsAdInsights(toGatewayParams(a, 'adId'));
      return {
        content: [
          {
            text: `Ad Insights (${a.platform}):\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_ads_adset_insights: async (a) => {
      const result = await client.getAdsAdSetInsights(
        toGatewayParams(a, 'adSetId'),
      );
      return {
        content: [
          {
            text: `Ad Set Insights (${a.platform}):\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown ads gateway tool: ${name}`);
  return handler(args);
}
