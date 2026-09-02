import { CLOUD_AGENT_TOOL_EXTENSIONS } from '@api/services/agent-orchestrator/tools/agent-tool-registry.extensions';
import { getToolsForSurface, toAgentTools } from '@genfeedai/actions';
import type { AgentToolDefinition } from '@genfeedai/contracts/interfaces';
import { AgentToolName } from '@genfeedai/contracts/interfaces';

const BASE_AGENT_TOOLS: AgentToolDefinition[] = toAgentTools(
  getToolsForSurface('agent'),
) as AgentToolDefinition[];

const CANONICAL_OVERLAP_TOOL_NAMES = new Set<AgentToolName>([
  AgentToolName.CREATE_AD_REMIX_WORKFLOW,
  AgentToolName.GET_AD_RESEARCH_DETAIL,
  AgentToolName.LIST_ADS_RESEARCH,
]);

const FILTERED_CLOUD_AGENT_TOOL_EXTENSIONS = CLOUD_AGENT_TOOL_EXTENSIONS.filter(
  (tool) => !CANONICAL_OVERLAP_TOOL_NAMES.has(tool.name),
);

/**
 * Agent-side drift guard, mirroring `ToolRegistryService.validateDispatchCoverage`
 * on MCP. A cloud extension that names an action the curated catalog does not
 * surface to the agent would ship a live, credit-costed tool outside review.
 */
function assertExtensionsAreCurated(
  baseTools: AgentToolDefinition[],
  extensions: AgentToolDefinition[],
): void {
  const curatedAgentNames = new Set(baseTools.map((tool) => String(tool.name)));
  const uncurated = extensions
    .map((tool) => String(tool.name))
    .filter((name) => !curatedAgentNames.has(name));

  if (uncurated.length > 0) {
    throw new Error(
      `Agent tool registry drift: [${uncurated.join(', ')}] ship to the agent without an 'agent' surface in the curated action catalog. Add them to CURATED_ACTION_CATALOG with a source tool definition instead of extending here.`,
    );
  }
}

assertExtensionsAreCurated(
  BASE_AGENT_TOOLS,
  FILTERED_CLOUD_AGENT_TOOL_EXTENSIONS,
);

function mergeAgentTools(
  baseTools: AgentToolDefinition[],
  extensions: AgentToolDefinition[],
): AgentToolDefinition[] {
  const merged = new Map<string, AgentToolDefinition>(
    baseTools.map((tool) => [String(tool.name), tool]),
  );

  for (const tool of extensions) {
    merged.set(String(tool.name), tool);
  }

  return [...merged.values()];
}

export const AGENT_TOOLS: AgentToolDefinition[] = mergeAgentTools(
  BASE_AGENT_TOOLS,
  FILTERED_CLOUD_AGENT_TOOL_EXTENSIONS,
);

export function getToolDefinitions(): AgentToolDefinition[] {
  return AGENT_TOOLS;
}

export function getToolDefinitionByName(
  name: string,
): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => String(tool.name) === name);
}
