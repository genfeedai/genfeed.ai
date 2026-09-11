import type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface';
import { ALL_TOOLS } from './tool-assembly';
import { CORE_TOOLSET_NAME, isToolsetName, TOOLSETS } from './toolsets';

export { ALL_TOOLS } from './tool-assembly';

const roleWeight: Record<ToolRequiredRole, number> = {
  admin: 1,
  superadmin: 2,
  user: 0,
};

const toolsByName = new Map<string, CanonicalToolDefinition>(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

const unknownToolsetTools = ALL_TOOLS.filter(
  (tool) => !isToolsetName(tool.toolset),
).map((tool) => tool.name);
if (unknownToolsetTools.length > 0) {
  throw new Error(
    `canonical tools with an unknown toolset: ${unknownToolsetTools.join(', ')}`,
  );
}

const toolsetsWithoutEntries = TOOLSETS.filter(
  (definition) => !ALL_TOOLS.some((tool) => tool.toolset === definition.name),
).map((definition) => definition.name);
if (toolsetsWithoutEntries.length > 0) {
  throw new Error(
    `toolsets with no tools: ${toolsetsWithoutEntries.join(', ')}`,
  );
}

const CORE_MCP_TOOL_LIMIT = 12;
const coreMcpToolCount = ALL_TOOLS.filter(
  (tool) => tool.toolset === CORE_TOOLSET_NAME && tool.surfaces.mcp,
).length;
if (coreMcpToolCount > CORE_MCP_TOOL_LIMIT) {
  throw new Error(
    `core toolset exceeds the ${CORE_MCP_TOOL_LIMIT}-tool MCP limit: has ${coreMcpToolCount}`,
  );
}

export function getToolByName(
  name: string,
): CanonicalToolDefinition | undefined {
  return toolsByName.get(name);
}

export function getToolsForSurface(
  surface: 'agent' | 'mcp' | 'cli',
): CanonicalToolDefinition[] {
  return ALL_TOOLS.filter((tool) =>
    surface === 'cli' ? tool.surfaces.cliAgentVisible : tool.surfaces[surface],
  );
}

export function getToolsByCategory(
  category: ToolCategory,
): CanonicalToolDefinition[] {
  return ALL_TOOLS.filter((tool) => tool.category === category);
}

export function getToolsForRole(
  surface: 'agent' | 'mcp' | 'cli',
  role: ToolRequiredRole,
): CanonicalToolDefinition[] {
  const roleLevel = roleWeight[role];
  return getToolsForSurface(surface).filter(
    (tool) => roleWeight[tool.requiredRole] <= roleLevel,
  );
}
