import type { ClientService } from '@mcp/services/client.service';
import { storyboardToolSchemas } from '@mcp/tools/storyboard.schemas';

export async function handleStoryboardTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  if (name !== 'storyboard_run_capabilities')
    throw new Error(`Unknown Storyboard tool: ${name}`);
  const result = await client.getStoryboardRunCapabilities(
    storyboardToolSchemas.storyboard_run_capabilities.parse(args),
  );
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
