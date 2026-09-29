vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';

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
