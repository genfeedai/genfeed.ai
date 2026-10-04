import type { AgentToolOutput } from '@genfeedai/actions';
import { getToolsForSurface, toAgentTools } from '@genfeedai/actions';

/**
 * Agent-side drift guard. The curated action catalog is the single source of
 * every agent tool definition, so a name that appears twice is a second
 * definition competing with the first. Throw instead of letting one silently
 * win; the agent and MCP surfaces must never disagree about a tool.
 */
export function assertUniqueAgentToolNames(tools: AgentToolOutput[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const tool of tools) {
    const name = String(tool.name);
    if (seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Agent tool registry drift: [${[...duplicates].join(', ')}] are defined more than once. Define each tool once in the curated action catalog.`,
    );
  }
}

const BASE_AGENT_TOOLS: AgentToolOutput[] = toAgentTools(
  getToolsForSurface('agent'),
);

assertUniqueAgentToolNames(BASE_AGENT_TOOLS);

export const AGENT_TOOLS: AgentToolOutput[] = BASE_AGENT_TOOLS;

export function getToolDefinitions(): AgentToolOutput[] {
  return AGENT_TOOLS;
}

export function getToolDefinitionByName(
  name: string,
): AgentToolOutput | undefined {
  return AGENT_TOOLS.find((tool) => String(tool.name) === name);
}
