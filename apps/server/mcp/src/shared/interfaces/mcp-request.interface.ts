import type { ToolsetName } from '@genfeedai/actions';
import type { McpRole } from '@mcp/services/auth.service';
import type { Request } from 'express';

/**
 * Identity resolved by `mcpAuthMiddleware` (raw `/mcp` transport) or
 * `McpAuthGuard` (REST mirror). Absent for an unauthenticated public
 * discovery request (`isPublicMcpRequest`).
 */
export interface McpAuthContext {
  token?: string;
  userId?: string;
  organizationId?: string;
  role?: McpRole;
}

/**
 * Express request shape shared by every MCP entry point that needs the
 * caller's auth context and/or requested toolset selection.
 *
 * `toolsets` is populated by the `?toolsets=` query middleware
 * (`toolsetsQueryMiddleware`) BEFORE authentication runs, so it is present
 * even for unauthenticated public `tools/list` requests — toolset scoping is
 * not an authenticated-only feature.
 */
export interface McpRequest extends Request {
  authContext?: McpAuthContext;
  toolsets?: readonly ToolsetName[];
}
