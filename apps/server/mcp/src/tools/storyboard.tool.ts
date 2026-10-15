import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
import { storyboardToolSchemas } from '@mcp/tools/storyboard.schemas';

export const STORYBOARD_TOOL_NAMES = new Set<string>([
  'create_storyboard_remix',
  'replace_storyboard_character',
  'storyboard_run_capabilities',
]);

function textResult(result: unknown) {
  return {
    structuredContent: { data: result },
    content: [{ type: 'text' as const, text: formatToolData(result) }],
  };
}

export async function handleStoryboardTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'storyboard_run_capabilities':
      return textResult(
        await client.getStoryboardRunCapabilities(
          storyboardToolSchemas.storyboard_run_capabilities.parse(args),
        ),
      );
    case 'create_storyboard_remix':
      return textResult(
        await client.createStoryboardRemix(
          storyboardToolSchemas.create_storyboard_remix.parse(args),
        ),
      );
    case 'replace_storyboard_character':
      return textResult(
        await client.replaceStoryboardCharacter(
          storyboardToolSchemas.replace_storyboard_character.parse(args),
        ),
      );
    default:
      throw new Error(`Unknown Storyboard tool: ${name}`);
  }
}
