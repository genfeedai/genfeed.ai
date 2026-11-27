/** The roles an MCP connection can hold, lowest first. */
export const MCP_ROLES = ['user', 'admin', 'superadmin'] as const;

export type McpRole = (typeof MCP_ROLES)[number];

const ROLE_RANK: Readonly<Record<McpRole, number>> = {
  admin: 1,
  superadmin: 2,
  user: 0,
};

/** A role meets a requirement when it ranks at or above it; no requirement admits everyone. */
export function hasRequiredRole(
  role: McpRole,
  requiredRole: McpRole | undefined,
): boolean {
  return (
    requiredRole === undefined || ROLE_RANK[role] >= ROLE_RANK[requiredRole]
  );
}

/**
 * The tools a role may call. Use it for `tools/list` so a connection never
 * advertises a tool it cannot run; the call path still checks the role.
 */
export function filterToolsByRole<T extends { requiredRole?: McpRole }>(
  tools: readonly T[],
  role: McpRole,
): T[] {
  return tools.filter((tool) => hasRequiredRole(role, tool.requiredRole));
}
