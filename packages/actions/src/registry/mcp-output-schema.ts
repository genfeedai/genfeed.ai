import type {
  CanonicalToolDefinition,
  ToolParameterSchema,
} from '../interfaces/tool-definition.interface';

/** Standard error/approval/card fields remain extensible and validated at transport. */
export const MCP_RESULT_SCHEMAS = {
  data: {
    type: 'object',
    properties: { data: {}, message: { type: 'string' } },
  },
  object: {
    type: 'object',
    properties: { data: { type: 'object' }, message: { type: 'string' } },
  },
  media: {
    type: 'object',
    properties: {
      data: {},
      artifact: { type: 'object' },
      message: { type: 'string' },
    },
  },
  discovery: {
    type: 'object',
    properties: {
      connection: { type: 'object' },
      tool: { type: 'object' },
      tools: { type: 'array' },
      toolsets: { type: 'array' },
      message: { type: 'string' },
    },
  },
} as const satisfies Record<string, ToolParameterSchema>;

export function getMcpToolResultFamily(
  tool: Pick<CanonicalToolDefinition, 'name' | 'category'>,
) {
  if (tool.name === 'find_tools') return 'discovery';
  if (['get_account', 'list_orgs', 'switch_org'].includes(tool.name))
    return 'object';
  if (
    tool.category === 'generation' ||
    tool.name === 'get_job_status' ||
    tool.name === 'resolve_approval'
  )
    return 'media';
  return 'data';
}

export function getMcpToolOutputSchema(
  tool: Pick<CanonicalToolDefinition, 'name' | 'category'>,
) {
  return MCP_RESULT_SCHEMAS[getMcpToolResultFamily(tool)];
}
