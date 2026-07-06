import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';

describe('MetaAdsBulkController RBAC', () => {
  it('should require owner or admin role for createBulkUpload', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsBulkController.prototype.createBulkUpload,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner or admin role for updateJob', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsBulkController.prototype.updateJob,
    );
    expect(metadata).toEqual(['owner', 'admin']);
  });

  it('should require owner, admin, or analytics role for listJobs', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsBulkController.prototype.listJobs,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });

  it('should require owner, admin, or analytics role for getJobStatus', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      MetaAdsBulkController.prototype.getJobStatus,
    );
    expect(metadata).toEqual(['owner', 'admin', 'analytics']);
  });
});
