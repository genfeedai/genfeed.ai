import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';

export interface McpToolOutput {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  requiredRole: 'user' | 'admin' | 'superadmin';
}

export function toMcpTools(tools: CanonicalToolDefinition[]): McpToolOutput[] {
  return tools
    .filter((tool) => tool.surfaces.mcp)
    .map((tool) => ({
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
