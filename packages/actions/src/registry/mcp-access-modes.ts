import { curatedActionNames } from './curated-action-catalog';
import { getRetiredMcpCatalogTool } from './mcp-catalog-calls';
import { ALL_TOOLS } from './tool-assembly';

/**
 * Endpoint and OAuth grant policy, independent of the client's reported name.
 * `admin` is the staff endpoint (`/mcp/admin`): the admin-gated tools only,
 * which no other endpoint lists.
 */
export type McpAccessMode = 'standard' | 'claude' | 'admin';

/** Anything unrecognised fails closed to the narrowest mode. */
export function parseMcpAccessMode(value: unknown): McpAccessMode {
  if (value === undefined || value === 'standard') {
    return 'standard';
  }
  return value === 'admin' ? 'admin' : 'claude';
}

/**
 * Combine the modes a request carries (route, key). An absent mode takes no
 * part. `admin` survives only when every given mode is `admin`, so an admin
 * key on another route, or a standard key on the admin route, never gains the
 * admin tools.
 */
export function mostRestrictiveMcpAccessMode(
  ...modes: unknown[]
): McpAccessMode {
  const parsed = modes
    .filter((mode) => mode !== undefined)
    .map(parseMcpAccessMode);
  if (parsed.includes('claude')) {
    return 'claude';
  }
  return parsed.length > 0 && parsed.every((mode) => mode === 'admin')
    ? 'admin'
    : 'standard';
}

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
export const CLAUDE_MCP_TOOL_NAMES: ReadonlySet<string> = curatedActionNames(
  (entry) => entry.claudeAccess === 'mcp' || entry.claudeAccess === 'both',
);

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
  const canonicalName =
    surface === 'mcp'
      ? (getRetiredMcpCatalogTool(name)?.canonicalName ?? name)
      : name;
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
  return (
    surface === 'agent' ? CLAUDE_MCP_AGENT_TOOL_NAMES : CLAUDE_MCP_TOOL_NAMES
  ).has(canonicalName);
}
