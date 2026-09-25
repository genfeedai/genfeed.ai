import type { ClientService } from '@mcp/services/client.service';
import { remixToolSchemas } from '@mcp/tools/remix.schemas';

export const REMIX_TOOL_NAMES = new Set(Object.keys(remixToolSchemas));

/** Executed only after the shared registry mutation policy has authorized the call. */
export async function handleRemixTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  let result: Record<string, unknown>;
  switch (name) {
    case 'import_source_post':
      result = await client.importSourcePost(
        remixToolSchemas.import_source_post.parse(args),
      );
      break;
    case 'create_remix_concept':
      result = await client.createRemixConcept(
        remixToolSchemas.create_remix_concept.parse(args),
      );
      break;
    case 'get_remix_run':
      result = await client.getRemixRun(
        remixToolSchemas.get_remix_run.parse(args),
      );
      break;
    case 'update_remix_concept':
      result = await client.updateRemixConcept(
        remixToolSchemas.update_remix_concept.parse(args),
      );
      break;
    case 'attach_remix_analysis_source':
      result = await client.attachRemixAnalysisSource(
        remixToolSchemas.attach_remix_analysis_source.parse(args),
      );
      break;
    case 'quote_remix_generation':
      result = await client.quoteRemixGeneration(
        remixToolSchemas.quote_remix_generation.parse(args),
      );
      break;
    case 'start_remix_generation':
      result = await client.startRemixGeneration(
        remixToolSchemas.start_remix_generation.parse(args),
      );
      break;
    case 'control_remix_generation':
      result = await client.controlRemixGeneration(
        remixToolSchemas.control_remix_generation.parse(args),
      );
      break;
    default:
      throw new Error(`Unknown remix tool: ${name}`);
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}
