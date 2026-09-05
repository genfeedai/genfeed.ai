import { CLOUD_AGENT_TOOL_EXTENSIONS } from '@api/services/agent-orchestrator/tools/agent-tool-registry.extensions';
import type { AgentToolOutput, CuratedActionName } from '@genfeedai/actions';
import { getToolsForSurface, toAgentTools } from '@genfeedai/actions';

const BASE_AGENT_TOOLS: AgentToolOutput[] = toAgentTools(
  getToolsForSurface('agent'),
);

const CANONICAL_OVERLAP_TOOL_NAMES = new Set<CuratedActionName>([
  'create_ad_remix_workflow',
  'get_ad_research_detail',
  'list_ads_research',
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
  baseTools: AgentToolOutput[],
  extensions: AgentToolOutput[],
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
  baseTools: AgentToolOutput[],
  extensions: AgentToolOutput[],
): AgentToolOutput[] {
  const merged = new Map<string, AgentToolOutput>(
    baseTools.map((tool) => [String(tool.name), tool]),
  );

  for (const tool of extensions) {
    merged.set(String(tool.name), tool);
  }

  return [...merged.values()];
}

export const AGENT_TOOLS: AgentToolOutput[] = mergeAgentTools(
  BASE_AGENT_TOOLS,
  FILTERED_CLOUD_AGENT_TOOL_EXTENSIONS,
);

export function getToolDefinitions(): AgentToolOutput[] {
  return AGENT_TOOLS;
}

export function getToolDefinitionByName(
  name: string,
): AgentToolOutput | undefined {
  return AGENT_TOOLS.find((tool) => String(tool.name) === name);
}
