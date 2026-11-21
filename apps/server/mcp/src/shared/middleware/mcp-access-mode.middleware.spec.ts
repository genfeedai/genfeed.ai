import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { mcpAccessModeMiddleware } from '@mcp/shared/middleware/mcp-access-mode.middleware';
import type { Response } from 'express';

describe('Claude endpoint routing', () => {
  it.each([{ profile: 'full' }, { toolsets: 'generation' }])(
    'ignores the retired catalog query %j',
    (query) => {
      const req = { path: '/mcp/claude', query } as unknown as McpRequest;
      const next = vi.fn();
      mcpAccessModeMiddleware(req, {} as Response, next);
      expect(req.routeAccessMode).toBe('claude');
      expect(next).toHaveBeenCalledOnce();
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

describe('Admin endpoint routing', () => {
  it.each(['/mcp/admin', '/mcp/admin/', '/MCP/ADMIN'])(
    'assigns the admin route %s before authentication',
    (path) => {
      const req = { path, query: {} } as unknown as McpRequest;
      const next = vi.fn();
      mcpAccessModeMiddleware(req, {} as Response, next);
      expect(req.routeAccessMode).toBe('admin');
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it('keeps /mcp standard', () => {
    const req = { path: '/mcp', query: {} } as unknown as McpRequest;
    mcpAccessModeMiddleware(req, {} as Response, vi.fn());
    expect(req.routeAccessMode).toBe('standard');
  });
});
