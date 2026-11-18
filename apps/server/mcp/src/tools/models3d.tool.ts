import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
import { models3dToolSchemas } from '@mcp/tools/models3d.schemas';

export const MODELS3D_TOOL_NAMES = new Set(Object.keys(models3dToolSchemas));

/** Executed only after the shared registry mutation policy has authorized the call. */
export async function handleModels3dTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  let result: Record<string, unknown>;
  switch (name) {
    case 'render_3d':
      result = await client.render3d(models3dToolSchemas.render_3d.parse(args));
      break;
    case 'get_model3d':
      result = await client.getModel3d(
        models3dToolSchemas.get_model3d.parse(args),
      );
      break;
    default:
      throw new Error(`Unknown 3D tool: ${name}`);
  }
  return {
    structuredContent: { data: result },
    content: [{ type: 'text' as const, text: formatToolData(result) }],
  };
}
