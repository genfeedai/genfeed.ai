import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';

/**
 * Fields and wording that only apply to the Genfeed app or an agent thread.
 * The canonical definitions stay shared; the MCP view drops what an MCP call
 * cannot use, so `tools/list` advertises only options that succeed there
 * (#7178). Execution still rejects these fields if a client sends them.
 */
interface McpSchemaProjection {
  description?: string;
  hiddenParameters: readonly string[];
}

const MCP_SCHEMA_PROJECTIONS: Readonly<Record<string, McpSchemaProjection>> = {
  create_post: {
    description:
      'Create a post draft from supplied text for review. It never publishes. Scheduling and publishing require a scheduled release and approval.',
    hiddenParameters: [
      'confirmed',
      'contentId',
      'ingredientId',
      'sourceActionId',
      'targets',
    ],
  },
};

export function projectMcpDescription(
  name: string,
  description: string,
): string {
  return MCP_SCHEMA_PROJECTIONS[name]?.description ?? description;
}

export function projectMcpParameters(
  name: string,
  parameters: ToolParameterSchema,
): ToolParameterSchema {
  const hidden = MCP_SCHEMA_PROJECTIONS[name]?.hiddenParameters;
  if (!hidden?.length) return parameters;
  const hiddenNames = new Set(hidden);
  return {
    ...parameters,
    properties: Object.fromEntries(
      Object.entries(parameters.properties).filter(
        ([key]) => !hiddenNames.has(key),
      ),
    ),
    ...(parameters.required
      ? {
          required: parameters.required.filter((key) => !hiddenNames.has(key)),
        }
      : {}),
  };
}
