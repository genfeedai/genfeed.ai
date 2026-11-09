import { curatedActionNames } from './curated-action-catalog';
import { getRetiredMcpCatalogTool } from './mcp-catalog-calls';
/** Endpoint and OAuth grant policy, independent of the client's reported name. */
export type McpAccessMode = 'standard' | 'claude';

export function parseMcpAccessMode(value: unknown): McpAccessMode {
  return value === undefined || value === 'standard' ? 'standard' : 'claude';
}

export function mostRestrictiveMcpAccessMode(
  ...modes: unknown[]
): McpAccessMode {
  return modes.some((mode) => parseMcpAccessMode(mode) === 'claude')
    ? 'claude'
    : 'standard';
}

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
  return (
    mode === 'standard' ||
    (surface === 'agent'
      ? CLAUDE_MCP_AGENT_TOOL_NAMES
      : CLAUDE_MCP_TOOL_NAMES
    ).has(
      surface === 'mcp'
        ? (getRetiredMcpCatalogTool(name)?.canonicalName ?? name)
        : name,
    )
  );
}
