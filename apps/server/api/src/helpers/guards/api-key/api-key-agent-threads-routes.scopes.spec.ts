import { AgentThreadSharesController } from '@api/collections/agent-threads/controllers/agent-thread-shares.controller';
import { AgentThreadTurnsController } from '@api/collections/agent-threads/controllers/agent-thread-turns.controller';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { AgentThreadRuntimeController } from '@api/services/agent-threading/controllers/agent-thread-runtime.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /agent/threads/:threadId/messages',
    AgentThreadTurnsController,
    AgentThreadTurnsController.prototype.addMessage,
  ],
  [
    'POST /agent/threads/:threadId/external-turns',
    AgentThreadTurnsController,
    AgentThreadTurnsController.prototype.appendExternalTurn,
  ],
  [
    'POST /agent/threads',
    AgentThreadsController,
    AgentThreadsController.prototype.createThread,
  ],
  [
    'PATCH /agent/threads/:threadId/context',
    AgentThreadsController,
    AgentThreadsController.prototype.updateThreadContext,
  ],
  [
    'PATCH /agent/threads/:threadId',
    AgentThreadsController,
    AgentThreadsController.prototype.updateThread,
  ],
  [
    'POST /agent/threads/:threadId/work-objects/:objectId/actions',
    AgentThreadRuntimeController,
    AgentThreadRuntimeController.prototype.actOnWorkObject,
  ],
  [
    'POST /agent/threads/:threadId/input-requests/:requestId/responses',
    AgentThreadRuntimeController,
    AgentThreadRuntimeController.prototype.respondToInputRequest,
  ],
  [
    'POST /agent/threads/:threadId/ui-actions',
    AgentThreadRuntimeController,
    AgentThreadRuntimeController.prototype.respondToUiAction,
  ],
  [
    'POST /agent/threads/:threadId/branches',
    AgentThreadRuntimeController,
    AgentThreadRuntimeController.prototype.branchThread,
  ],
];

describe.each(GEN_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['brands:write', 'brand-kit:write', 'credentials:read']],
    [['posts:approve', 'posts:publish', 'analytics:read']],
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
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /agent/threads/:threadId/shares',
    AgentThreadSharesController,
    AgentThreadSharesController.prototype.createShare,
  ],
  [
    'DELETE /agent/threads/:threadId/shares/:shareId',
    AgentThreadSharesController,
    AgentThreadSharesController.prototype.deleteShare,
  ],
  [
    'PATCH /agent/threads',
    AgentThreadsController,
    AgentThreadsController.prototype.bulkUpdateThreads,
  ],
];

describe.each(ADMIN_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'brands:write']],
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['admin']])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);
