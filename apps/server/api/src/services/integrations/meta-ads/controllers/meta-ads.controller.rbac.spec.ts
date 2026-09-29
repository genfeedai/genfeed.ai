import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';

const READ_METHODS = [
  'getAdAccounts',
  'listCampaigns',
  'compareCampaigns',
  'getCampaignInsights',
  'getAdSetInsights',
  'getAdInsights',
  'getAdCreatives',
  'getTopPerformers',
] as const;

const WRITE_METHODS = [
  'createCampaign',
  'updateCampaign',
  'createAdSet',
  'updateAdSet',
  'createAd',
  'pauseAd',
  'deleteAd',
  'uploadAdImage',
  'uploadAdVideo',
] as const;

describe('MetaAdsController RBAC', () => {
  it('should leave no direct Meta route without role and scope metadata', () => {
    const prototype = MetaAdsController.prototype as unknown as Record<
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
