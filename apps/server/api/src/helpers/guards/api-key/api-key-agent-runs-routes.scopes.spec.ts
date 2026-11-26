import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentStudioHandoffController } from '@api/services/agent-orchestrator/agent-studio-handoff.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /agent-strategies/:id/run-now',
    AgentStrategiesController,
    AgentStrategiesController.prototype.runNow,
  ],
  [
    'POST /agent/threads/turns',
    AgentOrchestratorController,
    AgentOrchestratorController.prototype.createTurn,
  ],
  [
    'POST /agent/threads/:threadId/turns',
    AgentOrchestratorController,
    AgentOrchestratorController.prototype.createThreadTurn,
  ],
  [
    'POST /agent/threads/turns/stream',
    AgentOrchestratorController,
    AgentOrchestratorController.prototype.createTurnStream,
  ],
  [
    'POST /agent/threads/:threadId/turns/stream',
    AgentOrchestratorController,
    AgentOrchestratorController.prototype.createThreadTurnStream,
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
    'PATCH /agent-strategies/:id',
    AgentStrategiesController,
    AgentStrategiesController.prototype.patch,
  ],
  [
    'POST /agent-strategies/:id/run-workflow',
    AgentStrategiesController,
    AgentStrategiesController.prototype.runWorkflow,
  ],
  [
    'POST /agent-strategies/:id/report-now',
    AgentStrategiesController,
    AgentStrategiesController.prototype.reportNow,
  ],
  [
    'POST /agent/studio-handoff',
    AgentStudioHandoffController,
    AgentStudioHandoffController.prototype.create,
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
