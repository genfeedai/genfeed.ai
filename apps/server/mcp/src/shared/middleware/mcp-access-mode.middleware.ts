import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import type { NextFunction, Response } from 'express';

export function mcpAccessModeMiddleware(
  req: McpRequest,
  res: Response,
  next: NextFunction,
): void {
  const route = req.path.replace(/\/+$/, '').toLowerCase();
  req.routeAccessMode = route === '/mcp/claude' ? 'claude' : 'standard';
  if (
    req.routeAccessMode === 'claude' &&
    (req.query.profile !== undefined || req.query.toolsets !== undefined)
  ) {
    res.status(400).json({
      error:
        'The Claude connector has a fixed content-operations tool catalog. Remove profile and toolsets from the URL.',
    });
    return;
  }
  next();
}
