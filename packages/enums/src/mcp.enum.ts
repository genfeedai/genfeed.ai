/**
 * Deferred MCP write-action approval state. Values match Prisma
 * `McpApprovalStatus` exactly.
 *
 * `mcp_approvals.status` is a Postgres enum column: a mutating MCP tool
 * persists a PENDING row instead of executing, and a human resolves it.
 *
 * @see packages/prisma/prisma/schema.prisma `enum McpApprovalStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const McpApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
} as const;

export type McpApprovalStatus =
  (typeof McpApprovalStatus)[keyof typeof McpApprovalStatus];
