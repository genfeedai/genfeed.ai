import { AuthDesktopController } from '@api/auth/controllers/auth-desktop.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { DesktopSyncController } from '@api/services/sync/desktop-sync.controller';
import { SyncController } from '@api/services/sync/sync.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /auth/desktop/authorize',
    AuthDesktopController,
    AuthDesktopController.prototype.authorize,
  ],
  [
    'POST /auth/desktop/status',
    AuthDesktopController,
    AuthDesktopController.prototype.status,
  ],
  [
    'POST /sync/desktop/threads',
    DesktopSyncController,
    DesktopSyncController.prototype.pushThreads,
  ],
  [
    'POST /sync/desktop/assets/metadata',
    DesktopSyncController,
    DesktopSyncController.prototype.pushAssets,
  ],
  [
    'POST /sync/desktop/assets/upload-url',
    DesktopSyncController,
    DesktopSyncController.prototype.requestAssetUpload,
  ],
  [
    'POST /sync/desktop/assets/:id/uploaded',
    DesktopSyncController,
    DesktopSyncController.prototype.confirmAssetUpload,
  ],
  [
    'POST /sync/desktop/assets/:id/upload',
    DesktopSyncController,
    DesktopSyncController.prototype.uploadAsset,
  ],
  [
    'POST /sync/desktop/ops',
    DesktopSyncController,
    DesktopSyncController.prototype.pushOps,
  ],
  [
    'POST /sync/workflows/push/:id',
    SyncController,
    SyncController.prototype.pushWorkflow,
  ],
  [
    'POST /sync/workflows/pull/:cloudId',
    SyncController,
    SyncController.prototype.pullWorkflow,
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
