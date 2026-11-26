import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { TasksPlanningController } from '@api/collections/tasks/controllers/tasks-planning.controller';
import { WorkspaceInboxReadController } from '@api/collections/tasks/controllers/workspace-inbox-read.controller';
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

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /tasks/:id/children',
    TasksPlanningController,
    TasksPlanningController.prototype.createChildren,
  ],
  ['POST /tasks', TasksController, TasksController.prototype.create],
  ['PATCH /tasks/:id', TasksController, TasksController.prototype.patch],
  [
    'PATCH /tasks/:id/outputs/:outputId',
    TasksController,
    TasksController.prototype.setOutputKept,
  ],
  [
    'POST /tasks/:id/checkout',
    TasksController,
    TasksController.prototype.checkout,
  ],
  [
    'POST /tasks/:id/release',
    TasksController,
    TasksController.prototype.release,
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
    'POST /tasks/:id/plan-thread',
    TasksPlanningController,
    TasksPlanningController.prototype.openPlanThread,
  ],
  [
    'DELETE /tasks/:id/outputs/:outputId',
    TasksController,
    TasksController.prototype.trashOutput,
  ],
  [
    'PATCH /tasks/inbox/read-state',
    WorkspaceInboxReadController,
    WorkspaceInboxReadController.prototype.read,
  ],
  [
    'PATCH /tasks/inbox/read-all',
    WorkspaceInboxReadController,
    WorkspaceInboxReadController.prototype.readAll,
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
