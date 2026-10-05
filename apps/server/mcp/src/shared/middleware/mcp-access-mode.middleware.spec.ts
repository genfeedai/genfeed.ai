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
  it('assigns the public Claude route before authentication', () => {
    const req = { path: '/mcp/claude', query: {} } as unknown as McpRequest;
    const next = vi.fn();
    mcpAccessModeMiddleware(req, {} as Response, next);
    expect(req.routeAccessMode).toBe('claude');
    expect(next).toHaveBeenCalledOnce();
  });
});
