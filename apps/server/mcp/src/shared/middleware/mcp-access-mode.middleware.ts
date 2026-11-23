import type { McpAccessMode } from '@genfeedai/actions';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import type { NextFunction, Response } from 'express';

const TRAILING_SLASHES_PATTERN = /\/+$/;

function resolveRouteAccessMode(route: string): McpAccessMode {
  if (route === '/mcp/claude') {
    return 'claude';
  }
  return route === '/mcp/admin' ? 'admin' : 'standard';
}

export function mcpAccessModeMiddleware(
  req: McpRequest,
  _res: Response,
  next: NextFunction,
): void {
  const route = req.path.replace(TRAILING_SLASHES_PATTERN, '').toLowerCase();
  req.routeAccessMode = resolveRouteAccessMode(route);
  next();
}
