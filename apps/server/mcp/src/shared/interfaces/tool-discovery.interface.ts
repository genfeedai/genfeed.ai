import type { McpToolOutput } from '@genfeedai/actions';

/**
 * Whatever exposes the role-filtered full catalog to the discovery handlers.
 * `search_tools`/`describe_tool` must be able to find a tool outside the
 * caller's currently-loaded toolset selection — the whole point is helping a
 * client discover what else exists so it can reconnect with a different
 * `?toolsets=`. Declared standalone (not importing `ToolRegistryService`) so
 * `tool-discovery.tool.ts` has no dependency back on the registry.
 */
export interface ToolDiscoverySource {
  getDiscoverableTools(): McpToolOutput[];
}

export interface ToolDiscoveryEntry {
  name: string;
  toolset: string;
  description: string;
  mutationPolicy: string;
  creditCost: number;
  requiredRole: McpToolOutput['requiredRole'];
}
