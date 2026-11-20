import type { McpAccessMode } from '@genfeedai/actions';
import type { McpRole } from '@mcp/services/auth.service';
import type { Request } from 'express';

/**
 * Identity resolved by `mcpAuthMiddleware` (raw `/mcp` transport) or
 * `McpAuthGuard` (REST mirror). Absent for an unauthenticated public
 * discovery request (`isPublicMcpRequest`).
 */
export interface McpAuthContext {
  accessMode?: McpAccessMode;
  hasBrandKitEditAccess?: boolean;
  token?: string;
  userId?: string;
  organizationId?: string;
  role?: McpRole;
}

/**
 * Express request shape shared by every MCP entry point that needs the
 * caller's auth context and the endpoint it came in on.
 */
export interface McpRequest extends Request {
  authContext?: McpAuthContext;
  routeAccessMode?: McpAccessMode;
}
