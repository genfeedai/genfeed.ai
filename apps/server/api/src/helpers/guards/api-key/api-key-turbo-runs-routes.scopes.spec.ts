import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { TurboRunController } from '@api/services/turbo-run/turbo-run.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /turbo-runs',
    TurboRunController,
    TurboRunController.prototype.createTurboRun,
  ],
  [
    'POST /turbo-runs/manual-review',
    TurboRunController,
    TurboRunController.prototype.createManualReviewTurboRun,
  ],
  [
    'POST /turbo-runs/:id/process',
    TurboRunController,
    TurboRunController.prototype.processTurboRun,
  ],
  [
    'POST /turbo-runs/:id/rewrite-jobs',
    TurboRunController,
    TurboRunController.prototype.createRewriteJob,
  ],
  [
    'POST /turbo-runs/:id/rewrite-jobs/:jobId/cancel',
    TurboRunController,
    TurboRunController.prototype.cancelRewriteJob,
  ],
  [
    'PATCH /turbo-runs/:id',
    TurboRunController,
    TurboRunController.prototype.patch,
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

const REV_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /turbo-runs/:id/items/action',
    TurboRunController,
    TurboRunController.prototype.itemAction,
  ],
  [
    'POST /turbo-runs/:id/items/:itemId/assign',
    TurboRunController,
    TurboRunController.prototype.assignItem,
  ],
  [
    'POST /turbo-runs/:id/items/:itemId/unassign',
    TurboRunController,
    TurboRunController.prototype.unassignItem,
  ],
];

describe.each(REV_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['posts:draft', 'posts:schedule', 'posts:publish']],
    [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
    [['posts:read', 'brands:read', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([['posts:approve'], ['admin']])(
    'allows a key with %s',
    async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    },
  );
});
