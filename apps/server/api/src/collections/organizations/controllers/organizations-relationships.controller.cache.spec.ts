import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import {
  adminUser,
  memberUser,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';

describe('Organization ingredients cache', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    OrganizationsRelationshipsController.prototype.findAllIngredients,
  );

  it.each([adminUser, memberUser])(
    'separates organizations in the path for the same caller',
    (user) => {
      const request = tenantReadRequest(user, { page: '1' });
      request.params.organizationId = sessionOrganizationId;
      const first = config.keyGenerator?.(request);
      request.params.organizationId = targetOrganizationId;
      const second = config.keyGenerator?.(request);
      expect(first).toContain(sessionOrganizationId);
      expect(second).toContain(targetOrganizationId);
      expect(second).not.toBe(first);
      expect(config.tags).toEqual(['ingredients']);
      expect(config.ttl).toBe(120);
    },
  );

  it('separates callers and queries within one organization', () => {
    const request = tenantReadRequest(adminUser, { page: '1' });
    request.params.organizationId = targetOrganizationId;
    const first = config.keyGenerator?.(request);
    request.query.page = '2';
    expect(config.keyGenerator?.(request)).not.toBe(first);
    request.query.page = '1';
    request.user = { ...adminUser, id: 'another-user' };
    expect(config.keyGenerator?.(request)).not.toBe(first);
  });
});
