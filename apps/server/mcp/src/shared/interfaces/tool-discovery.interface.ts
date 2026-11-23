import type { McpToolOutput } from '@genfeedai/actions';

/**
 * Whatever exposes the role-filtered catalog to the discovery handlers. Declared
 * standalone (not importing `ToolRegistryService`) so `tool-discovery.tool.ts`
 * has no dependency back on the registry.
 */
export interface ToolDiscoverySource {
  /** The role-filtered list this connection serves. */
  getTools(): McpToolOutput[];
}

export interface ToolDiscoveryEntry {
  name: string;
  actions: string[];
  description: string;
  mutationPolicy: string;
  creditCost: number;
  requiredRole: McpToolOutput['requiredRole'];
}
