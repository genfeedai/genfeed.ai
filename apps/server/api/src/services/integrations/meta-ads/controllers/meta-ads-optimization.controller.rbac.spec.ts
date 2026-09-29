import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';

const READ_METHODS = [
  'listRecommendations',
  'getConfig',
  'listAuditLogs',
] as const;

const WRITE_METHODS = [
  'updateRecommendation',
  'executeRecommendation',
  'updateConfig',
] as const;

describe('MetaAdsOptimizationController RBAC', () => {
  it('should leave no optimization route without role and scope metadata', () => {
    const prototype =
      MetaAdsOptimizationController.prototype as unknown as Record<
        string,
        object
      >;

    const routeHandlers = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => Reflect.hasMetadata('path', prototype[name]));

    expect(routeHandlers).toHaveLength(
      READ_METHODS.length + WRITE_METHODS.length,
    );

    for (const handler of routeHandlers) {
      expect(Reflect.getMetadata('roles', prototype[handler])).toBeDefined();
      expect(
        Reflect.getMetadata(API_KEY_SCOPES_KEY, prototype[handler]),
      ).toBeDefined();
    }
  });
});
