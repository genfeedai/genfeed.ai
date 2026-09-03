import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';

/**
 * `_meta` key carrying the minimum credit charge for one call of the tool.
 *
 * MCP `tools/list` entries only preserve arbitrary vendor data under `_meta`:
 * the SDK parses `annotations` with a stripping schema, so an unknown key
 * placed there is silently dropped by spec-compliant clients. The key is
 * namespaced per the MCP convention for vendor-specific metadata.
 */
export const MCP_CREDIT_COST_META_KEY = 'genfeed.ai/creditCost';
export const MCP_MUTATION_POLICY_META_KEY = 'genfeed.ai/mutationPolicy';

export interface McpToolOutput {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  requiredRole: 'user' | 'admin' | 'superadmin';
  _meta: Record<string, unknown>;
}

export function toMcpTools(tools: CanonicalToolDefinition[]): McpToolOutput[] {
  return tools
    .filter((tool) => tool.surfaces.mcp)
    .map((tool) => ({
      _meta: {
        [MCP_CREDIT_COST_META_KEY]: tool.creditCost,
        ...(tool.mutationPolicy
          ? { [MCP_MUTATION_POLICY_META_KEY]: tool.mutationPolicy }
          : {}),
      },
      description: tool.description,
      inputSchema: {
        properties: tool.parameters.properties,
        required: tool.parameters.required,
        type: tool.parameters.type,
      },
      name: tool.name,
      requiredRole: tool.requiredRole,
    }));
}
