import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';

describe('GoogleAdsController RBAC', () => {
  it('should require owner, admin, or analytics role for getSearchTerms', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.getSearchTerms,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });
});
