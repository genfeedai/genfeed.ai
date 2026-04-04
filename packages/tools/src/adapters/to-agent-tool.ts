import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';

export interface AgentToolOutput {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  creditCost: number;
}

export function toAgentTools(
  tools: CanonicalToolDefinition[],
): AgentToolOutput[] {
  return tools
    .filter((tool) => tool.surfaces.agent)
    .map((tool) => ({
      creditCost: tool.creditCost,
      description: tool.description,
      name: tool.name,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    }));
}
