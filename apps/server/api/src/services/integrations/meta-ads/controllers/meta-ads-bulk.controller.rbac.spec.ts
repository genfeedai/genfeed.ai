import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';

const READ_METHODS = ['listJobs', 'getJobStatus'] as const;

const WRITE_METHODS = ['createBulkUpload', 'updateJob'] as const;

describe('MetaAdsBulkController RBAC', () => {
  it('should leave no bulk-upload route without role and scope metadata', () => {
    const prototype = MetaAdsBulkController.prototype as unknown as Record<
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
