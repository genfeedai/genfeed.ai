import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { ApiKeyScope } from '@genfeedai/contracts';

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
  it.each(READ_METHODS)(
    'should require owner, admin, or analytics role for %s',
    (method) => {
      const metadata = Reflect.getMetadata(
        'roles',
        MetaAdsController.prototype[method],
      );

      expect(metadata).toEqual(['owner', 'admin', 'analytics']);
    },
  );

  it.each(READ_METHODS)(
    'should require an analytics-read scope for %s',
    (method) => {
      const metadata = Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        MetaAdsController.prototype[method],
      );

      expect(metadata).toEqual([ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN]);
    },
  );

  it.each(WRITE_METHODS)(
    'should require owner or admin role for %s',
    (method) => {
      const metadata = Reflect.getMetadata(
        'roles',
        MetaAdsController.prototype[method],
      );

      expect(metadata).toEqual(['owner', 'admin']);
    },
  );

  it.each(WRITE_METHODS)('should require the admin scope for %s', (method) => {
    const metadata = Reflect.getMetadata(
      API_KEY_SCOPES_KEY,
      MetaAdsController.prototype[method],
    );

    expect(metadata).toEqual([ApiKeyScope.ADMIN]);
  });

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
