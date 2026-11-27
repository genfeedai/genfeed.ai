import { assertMcpToolCap, hasRequiredRole } from '@genfeedai/mcp-kit';
import type {
  CanonicalToolDefinition,
  ToolCategory,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface';
import { isMcpListedToolName } from './mcp-catalog-calls';
import { ALL_TOOLS } from './tool-assembly';
import { isToolsetName, TOOLSETS } from './toolset-names';

export { ALL_TOOLS } from './tool-assembly';

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

// The cap counts what an ordinary caller sees; admin-only tools are not listed to them.
const listedMcpToolCount = ALL_TOOLS.filter(
  (tool) =>
    tool.surfaces.mcp &&
    isMcpListedToolName(tool.name) &&
    tool.requiredRole === 'user',
).length;
assertMcpToolCap(listedMcpToolCount);

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
  return getToolsForSurface(surface).filter((tool) =>
    hasRequiredRole(role, tool.requiredRole),
  );
}
