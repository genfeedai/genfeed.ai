import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const MCPA_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /mcp-approvals',
    McpApprovalsController,
    McpApprovalsController.prototype.create,
  ],
  [
    'POST /mcp-approvals/:id/resolve',
    McpApprovalsController,
    McpApprovalsController.prototype.resolve,
  ],
  [
    'POST /mcp-approvals/:id/confirm',
    McpApprovalsController,
    McpApprovalsController.prototype.confirm,
  ],
  [
    'POST /mcp-approvals/:id/claim',
    McpApprovalsController,
    McpApprovalsController.prototype.claim,
  ],
  [
    'POST /mcp-approvals/:id/result',
    McpApprovalsController,
    McpApprovalsController.prototype.attachResult,
  ],
];

describe.each(MCPA_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['credits:read', 'analytics:read', 'credentials:read']],
    [['videos:update', 'images:delete', 'prompts:update']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([
    ['videos:create'],
    ['images:create'],
    ['prompts:create'],
    ['articles:create'],
    ['posts:draft'],
    ['brands:write'],
    ['brand-kit:write'],
    ['posts:schedule'],
    ['posts:approve'],
    ['posts:publish'],
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});
