import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { mcpAccessModeMiddleware } from '@mcp/shared/middleware/mcp-access-mode.middleware';
import type { Response } from 'express';

describe('Claude endpoint routing', () => {
  it.each([{ profile: 'full' }, { toolsets: 'generation' }])(
    'rejects catalog overrides %j',
    (query) => {
      const req = { path: '/mcp/claude', query } as unknown as McpRequest;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      mcpAccessModeMiddleware(req, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    },
  );
  it.each(['/mcp/claude', '/mcp/claude/', '/MCP/CLAUDE', '/Mcp/Claude/'])(
    'assigns the public Claude route %s before authentication',
    (path) => {
      const req = { path, query: {} } as unknown as McpRequest;
      const next = vi.fn();
      mcpAccessModeMiddleware(req, {} as Response, next);
      expect(req.routeAccessMode).toBe('claude');
      expect(next).toHaveBeenCalledOnce();
    },
  );
});
