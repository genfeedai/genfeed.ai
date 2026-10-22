import { contentCampaignMcpSchema } from '@genfeedai/contracts/api-types/contracts/content-campaign.contract';
import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';

export const CONTENT_CAMPAIGN_TOOL_NAMES: ReadonlySet<string> = new Set([
  'manage_campaign',
]);

export async function handleContentCampaignTool(
  client: Pick<ClientService, 'manageCampaign'>,
  name: string,
  args: Record<string, unknown>,
) {
  if (!CONTENT_CAMPAIGN_TOOL_NAMES.has(name))
    throw new Error(`Unknown campaign tool: ${name}`);
  const input = contentCampaignMcpSchema.parse(args);
  const data = await client.manageCampaign(input);
  return {
    structuredContent: { data },
    content: [
      {
        type: 'text' as const,
        text: `Campaign ${input.action}:\n${formatToolData(data)}`,
      },
    ],
  };
}
