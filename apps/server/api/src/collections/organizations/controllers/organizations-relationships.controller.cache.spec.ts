import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import {
  adminUser,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
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
    request.user = { ...adminUser, id: 'another-user', userId: 'another-user' };
    expect(config.keyGenerator?.(request)).not.toBe(first);
  });
});

describe('Organization ingredients cache caller session scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    OrganizationsRelationshipsController.prototype.findAllIngredients,
  );

  it('separates members with different session brands and the same query', () => {
    const query = { brandId: sessionBrandId };
    const firstRequest = tenantReadRequest(memberUser, query);
    const secondRequest = tenantReadRequest(
      {
        ...memberUser,
        id: 'another-member',
        userId: 'another-member',
        brandId: targetBrandId,
      },
      query,
    );
    const switchedRequest = tenantReadRequest(
      { ...memberUser, brandId: targetBrandId },
      query,
    );
    for (const request of [firstRequest, secondRequest, switchedRequest])
      request.params.organizationId = sessionOrganizationId;
    const first = config.keyGenerator?.(firstRequest);
    expect(first).toContain(sessionBrandId);
    expect(config.keyGenerator?.(secondRequest)).not.toBe(first);
    expect(config.keyGenerator?.(switchedRequest)).not.toBe(first);
  });

  it('separates session organizations for the same path and query', () => {
    const firstRequest = tenantReadRequest(adminUser);
    const secondRequest = tenantReadRequest({
      ...adminUser,
      organizationId: targetOrganizationId,
    });
    for (const request of [firstRequest, secondRequest])
      request.params.organizationId = targetOrganizationId;
    const first = config.keyGenerator?.(firstRequest);
    expect(first).toContain(targetOrganizationId);
    expect(config.keyGenerator?.(secondRequest)).not.toBe(first);
  });
});
