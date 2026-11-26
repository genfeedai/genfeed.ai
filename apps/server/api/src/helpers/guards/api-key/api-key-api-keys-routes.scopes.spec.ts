import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
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

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  ['POST /api-keys', ApiKeysController, ApiKeysController.prototype.create],
  [
    'PATCH /api-keys/:apiKeyId',
    ApiKeysController,
    ApiKeysController.prototype.update,
  ],
  [
    'POST /api-keys/:apiKeyId/rotate',
    ApiKeysController,
    ApiKeysController.prototype.rotate,
  ],
  [
    'POST /api-keys/:apiKeyId/verify-mcp',
    ApiKeysController,
    ApiKeysController.prototype.verifyMcpConnection,
  ],
  [
    'DELETE /api-keys/:apiKeyId',
    ApiKeysController,
    ApiKeysController.prototype.revoke,
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

describe('POST /api-keys/validate API key scope', () => {
  const validate = ApiKeysController.prototype.validate;

  it.each([
    [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    [['admin']],
  ])('allows a key with %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(ApiKeysController, validate, 'POST')),
    ).resolves.toBe(true);
  });

  it('refuses a key with no scopes', async () => {
    const guard = buildGuard(keyWithScopes([]));

    await expect(
      guard.canActivate(routeContext(ApiKeysController, validate, 'POST')),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });
});
