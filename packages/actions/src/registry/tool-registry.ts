import type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface';
import { isMcpListedToolName } from './mcp-catalog-calls';
import { ALL_TOOLS } from './tool-assembly';
import { isToolsetName, TOOLSETS } from './toolset-names';

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

/**
 * The most tools any connection lists to an ordinary caller. Every connection
 * lists every tool, so this is the size of the whole user-facing MCP catalog.
 * Merge related actions into an existing `{action, input}` tool instead of
 * raising it.
 */
export const MCP_TOOL_CAP = 30;

// The cap counts what an ordinary caller sees; admin-only tools are not listed to them.
const listedMcpToolCount = ALL_TOOLS.filter(
  (tool) =>
    tool.surfaces.mcp &&
    isMcpListedToolName(tool.name) &&
    tool.requiredRole === 'user',
).length;
if (listedMcpToolCount > MCP_TOOL_CAP) {
  throw new Error(
    `MCP catalog exceeds the ${MCP_TOOL_CAP}-tool cap: lists ${listedMcpToolCount}`,
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
    surface === 'cli'
      ? tool.surfaces.cliAgentVisible
      : tool.surfaces[surface] &&
        (surface !== 'mcp' || isMcpListedToolName(tool.name)),
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
