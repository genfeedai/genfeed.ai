vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import { ApiKeyScope } from '@genfeedai/contracts';

const READ_HANDLERS = [
  'comparePlatforms',
  'getAdAccounts',
  'listCampaigns',
  'getCampaignInsights',
  'getAdSetInsights',
  'getAdInsights',
  'getTopPerformers',
  'listAdSets',
  'listAds',
] as const;

const WRITE_HANDLERS = [
  'createCampaign',
  'updateCampaign',
  'createAdSet',
  'createAd',
] as const;

describe('AdsGatewayController RBAC', () => {
  it.each(READ_HANDLERS)(
    'requires owner, admin, or analytics role for %s',
    (handler) => {
      const metadata = Reflect.getMetadata(
        'roles',
        AdsGatewayController.prototype[handler],
      );

      expect(metadata).toEqual(['owner', 'admin', 'analytics']);
    },
  );

  it.each(READ_HANDLERS)(
    'requires an analytics-read scope for %s',
    (handler) => {
      const metadata = Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        AdsGatewayController.prototype[handler],
      );

      expect(metadata).toEqual([ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN]);
    },
  );

  it.each(WRITE_HANDLERS)('requires owner or admin role for %s', (handler) => {
    const metadata = Reflect.getMetadata(
      'roles',
      AdsGatewayWriteController.prototype[handler],
    );

    expect(metadata).toEqual(['owner', 'admin']);
  });

  it.each(WRITE_HANDLERS)('requires the admin scope for %s', (handler) => {
    const metadata = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      AdsGatewayWriteController.prototype[handler],
    );

    expect(metadata).toEqual([ApiKeyScope.ADMIN]);
  });

  it('leaves no paid-media route without role and scope metadata', () => {
    const prototypes = [
      AdsGatewayController.prototype,
      AdsGatewayWriteController.prototype,
    ] as unknown as Array<Record<string, object>>;
    const routeHandlers = prototypes.flatMap((prototype) =>
      Object.getOwnPropertyNames(prototype)
        .filter((name) => name !== 'constructor')
        .filter((name) => Reflect.hasMetadata('path', prototype[name]))
        .map((name) => prototype[name]),
    );

    expect(routeHandlers).toHaveLength(
      READ_HANDLERS.length + WRITE_HANDLERS.length,
    );

    for (const handler of routeHandlers) {
      expect(Reflect.getMetadata('roles', handler)).toBeDefined();
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toBeDefined();
    }
  });
});
