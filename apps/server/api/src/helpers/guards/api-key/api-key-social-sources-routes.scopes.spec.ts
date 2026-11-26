import { SocialSourcesController } from '@api/collections/social-sources/controllers/social-sources.controller';
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

const EDIT_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /social-sources/validate',
    SocialSourcesController,
    SocialSourcesController.prototype.validate,
  ],
  [
    'POST /social-sources/import-post',
    SocialSourcesController,
    SocialSourcesController.prototype.importPost,
  ],
  [
    'POST /social-sources/sync',
    SocialSourcesController,
    SocialSourcesController.prototype.syncBrand,
  ],
  [
    'POST /social-sources',
    SocialSourcesController,
    SocialSourcesController.prototype.create,
  ],
  [
    'PATCH /social-sources/:id',
    SocialSourcesController,
    SocialSourcesController.prototype.update,
  ],
  [
    'DELETE /social-sources/:id',
    SocialSourcesController,
    SocialSourcesController.prototype.remove,
  ],
  [
    'POST /social-sources/history-import',
    SocialSourcesController,
    SocialSourcesController.prototype.scheduleHistoryImport,
  ],
  [
    'POST /social-sources/:id/sync',
    SocialSourcesController,
    SocialSourcesController.prototype.syncOne,
  ],
];

describe.each(EDIT_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:create', 'images:create', 'prompts:create']],
    [['articles:create', 'posts:draft', 'posts:schedule']],
    [['brands:read', 'credits:read', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([['brands:write'], ['brand-kit:write'], ['admin']])(
    'allows a key with %s',
    async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    },
  );
});
