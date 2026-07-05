import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';

describe('MetaAdsOptimizationController RBAC', () => {
  it('should require owner or admin role for approveRecommendation', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.approveRecommendation,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for rejectRecommendation', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.rejectRecommendation,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for executeRecommendation', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.executeRecommendation,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for updateConfig', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.updateConfig,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner, admin, or analytics role for listRecommendations', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.listRecommendations,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getConfig', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.getConfig,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for listAuditLogs', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsOptimizationController.prototype.listAuditLogs,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });
});
