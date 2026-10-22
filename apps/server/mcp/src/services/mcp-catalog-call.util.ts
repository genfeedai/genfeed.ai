import {
  ALL_TOOLS,
  getMcpCatalogOperations,
  getRetiredMcpCatalogTool,
  getToolByName,
  isToolAllowedInMcpAccessMode,
  type McpAccessMode,
  type ResolvedMcpCatalogCall,
  resolveMcpCatalogCall,
  validateMcpCatalogBindings,
} from '@genfeedai/actions';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import type { McpRole } from '@mcp/services/auth.service';

export function resolveAuthorizedMcpCatalogCall(
  name: string,
  args: Record<string, unknown>,
  role: McpRole,
  accessMode: McpAccessMode,
): ResolvedMcpCatalogCall | null {
  const operation =
    getRetiredMcpCatalogTool(name) ??
    getMcpCatalogOperations(name).find(
      (candidate) => candidate.action === args.action,
    );
  if (operation) {
    for (const descriptorName of [
      operation.canonicalName,
      operation.executionName,
    ]) {
      if (!isToolAllowedInMcpAccessMode(accessMode, descriptorName)) {
        throw new Error('Tool unavailable through this connector.');
      }
      const descriptor = getToolByName(descriptorName);
      if (!descriptor?.surfaces.mcp)
        throw new Error(`Unknown tool: ${descriptorName}`);
      McpAuthGuard.checkToolRole(role, descriptor.requiredRole);
    }
  }
  return resolveMcpCatalogCall(name, args);
}

export function validateMcpCatalogDispatchCoverage(
  classify: (name: string) => string,
  preDispatchNames: ReadonlySet<string>,
): void {
  validateMcpCatalogBindings(ALL_TOOLS, classify);
  const unroutable = ALL_TOOLS.filter((tool) => tool.surfaces.mcp)
    .map((tool) => tool.name)
    .filter((name) => !preDispatchNames.has(name))
    .filter((name) => classify(name) === 'unknown');
  if (unroutable.length > 0) {
    throw new Error(
      `MCP tool registry drift: no executor dispatch for [${unroutable.join(
        ', ',
      )}]. Add a handler + classify() entry, or unset surfaces.mcp.`,
    );
  }
}
