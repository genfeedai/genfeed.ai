import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';

describe('GoogleAdsController RBAC', () => {
  it('should require owner or admin role for connect', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.connect,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for verify', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.verify,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner, admin, or analytics role for listCustomers', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.listCustomers,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for listCampaigns', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.listCampaigns,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getCampaignMetrics', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.getCampaignMetrics,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getAdGroupInsights', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.getAdGroupInsights,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getKeywordPerformance', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.getKeywordPerformance,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getSearchTerms', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      GoogleAdsController.prototype.getSearchTerms,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });
});
