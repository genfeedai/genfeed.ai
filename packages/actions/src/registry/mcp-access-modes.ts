import type { McpAccessMode } from '@genfeedai/mcp-kit';
import { curatedActionNames } from './curated-action-catalog';
import { MCP_CATALOG_TOOLS } from './mcp-catalog/catalog';
import { getRetiredMcpCatalogTool } from './mcp-catalog-calls';
import { ALL_TOOLS } from './tool-assembly';

/**
 * MCP tools gated to organization admins. They are listed and callable only
 * on the admin endpoint, which only `@genfeed.ai` owners and admins can
 * connect to.
 */
export const ADMIN_MCP_TOOL_NAMES: ReadonlySet<string> = new Set(
  ALL_TOOLS.filter(
    (tool) => tool.surfaces.mcp && tool.requiredRole !== 'user',
  ).map((tool) => tool.name),
);

/**
 * Future tools remain unavailable until their execution paths are reviewed:
 * a tool is reachable under a Claude grant only when its curated catalog
 * entry declares `claudeAccess`.
 */
const CLAUDE_CATALOG_ACTIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map(
  MCP_CATALOG_TOOLS.map((tool) => [
    tool.name,
    new Set<string>('claudeActions' in tool ? tool.claudeActions : []),
  ]),
);

/**
 * A merged tool declares the actions a Claude grant may run in
 * `claudeActions`, so its curated entry carries no `claudeAccess` of its own.
 */
export const CLAUDE_MCP_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...curatedActionNames(
    (entry) => entry.claudeAccess === 'mcp' || entry.claudeAccess === 'both',
  ),
  ...[...CLAUDE_CATALOG_ACTIONS]
    .filter(([, actions]) => actions.size > 0)
    .map(([name]) => name),
]);

/** The onboarding MCP adapter invokes these reviewed internal operations. */
export const CLAUDE_MCP_AGENT_TOOL_NAMES: ReadonlySet<string> =
  curatedActionNames(
    (entry) => entry.claudeAccess === 'agent' || entry.claudeAccess === 'both',
  );

export function isToolAllowedInMcpAccessMode(
  mode: McpAccessMode,
  name: string,
  surface: 'mcp' | 'agent' = 'mcp',
): boolean {
  const retired =
    surface === 'mcp' ? getRetiredMcpCatalogTool(name) : undefined;
  const canonicalName = retired?.canonicalName ?? name;
  const isAdminTool =
    surface === 'mcp' && ADMIN_MCP_TOOL_NAMES.has(canonicalName);
  // Admin-gated tools exist on the admin endpoint only, even when a Claude
  // catalog entry would otherwise reach them, and that endpoint serves
  // nothing else on the MCP surface.
  if (mode === 'admin') {
    return surface !== 'mcp' || isAdminTool;
  }
  if (isAdminTool) {
    return false;
  }
  if (mode === 'standard') {
    return true;
  }
  if (retired) {
    return (
      CLAUDE_CATALOG_ACTIONS.get(retired.canonicalName)?.has(retired.action) ===
      true
    );
  }
  return (
    surface === 'agent' ? CLAUDE_MCP_AGENT_TOOL_NAMES : CLAUDE_MCP_TOOL_NAMES
  ).has(canonicalName);
}
