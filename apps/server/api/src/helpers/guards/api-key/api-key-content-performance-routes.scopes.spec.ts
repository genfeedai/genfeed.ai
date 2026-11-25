import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
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
  [
    'POST /content-performance/analytics-sync/trigger',
    AnalyticsSyncController,
    AnalyticsSyncController.prototype.triggerSync,
  ],
  [
    'POST /content-performance/analytics-sync/run',
    AnalyticsSyncController,
    AnalyticsSyncController.prototype.runSync,
  ],
  [
    'POST /content-performance/analytics-sync/digest',
    AnalyticsSyncController,
    AnalyticsSyncController.prototype.triggerDigest,
  ],
  [
    'POST /content-performance/analytics-sync/digest/send',
    AnalyticsSyncController,
    AnalyticsSyncController.prototype.sendDigest,
  ],
  [
    'POST /content-performance',
    ContentPerformanceController,
    ContentPerformanceController.prototype.create,
  ],
  [
    'POST /content-performance/import/csv',
    ContentPerformanceController,
    ContentPerformanceController.prototype.importCsv,
  ],
  [
    'POST /content-performance/import/manual',
    ContentPerformanceController,
    ContentPerformanceController.prototype.importManual,
  ],
  [
    'POST /content-performance/manual-import',
    ContentPerformanceController,
    ContentPerformanceController.prototype.manualImport,
  ],
  [
    'DELETE /content-performance/:id',
    ContentPerformanceController,
    ContentPerformanceController.prototype.delete,
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
