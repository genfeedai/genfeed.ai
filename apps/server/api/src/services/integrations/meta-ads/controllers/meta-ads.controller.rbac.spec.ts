import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';

describe('MetaAdsController RBAC', () => {
  it('should require owner, admin, or analytics role for read endpoints', () => {
    const readMethods = [
      'getAdAccounts',
      'listCampaigns',
      'compareCampaigns',
      'getCampaignInsights',
      'getAdSetInsights',
      'getAdInsights',
      'getAdCreatives',
      'getTopPerformers',
    ] as const;

    for (const method of readMethods) {
      const metadata = Reflect.getMetadata(
        'roles',
        MetaAdsController.prototype[method],
      );
      expect(metadata).toEqual(['owner', 'admin', 'analytics']);
    }
  });

  it('should require owner or admin role for write endpoints', () => {
    const writeMethods = [
      'createCampaign',
      'updateCampaign',
      'pauseCampaign',
      'updateCampaignBudget',
      'createAdSet',
      'updateAdSet',
      'createAd',
      'pauseAd',
      'deleteAd',
      'uploadAdImage',
      'uploadAdVideo',
    ] as const;

    for (const method of writeMethods) {
      const metadata = Reflect.getMetadata(
        'roles',
        MetaAdsController.prototype[method],
      );
      expect(metadata).toEqual(['owner', 'admin']);
    }
  });
});
