import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
import {
  describePreset,
  listPresetSummaries,
} from '@mcp/tools/preset-catalog.util';
import { presetToolSchemas } from '@mcp/tools/presets.schemas';

export const PRESET_TOOL_NAMES = new Set<string>(
  Object.keys(presetToolSchemas),
);

function textResult(result: unknown) {
  return {
    structuredContent: { data: result },
    content: [{ type: 'text' as const, text: formatToolData(result) }],
  };
}

/** Read only. Nothing is generated and no credits are spent. */
export async function handlePresetTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_presets': {
      const input = presetToolSchemas.get_presets.parse(args);
      return textResult({
        presets: listPresetSummaries(await client.listPresets(), input),
      });
    }
    case 'get_preset': {
      const input = presetToolSchemas.get_preset.parse(args);
      return textResult(describePreset(await client.listPresets(), input));
    }
    default:
      throw new Error(`Unknown preset tool: ${name}`);
  }
}
