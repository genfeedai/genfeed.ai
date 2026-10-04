import {
  assertAnalyticsBrandInScope,
  runInAnalyticsTenantScope,
} from '@api/endpoints/analytics/analytics-tenant-scope';
import {
  getTenantContext,
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import { ForbiddenException } from '@nestjs/common';

/**
 * CLOUD tenant guard over analytics scope: a customer is always its own
 * tenant, a superadmin naming another organization is narrowed to it, and only
 * a superadmin naming none reads across every organization.
 */
function guardBrandLookup(where: {
  id: string;
  isDeleted: false;
  organizationId?: string;
}) {
  assertTenantScopedQuery({
    args: { where },
    isCloud: true,
    model: 'Brand',
    operation: 'findFirst',
    tenantModelNames: new Set(['Brand']),
  });
}

describe('runInAnalyticsTenantScope', () => {
  it('narrows a named organization to that tenant and enforces it', async () => {
    const seen = await runWithTenantContext(
      { organizationId: 'org-admin' },
      () =>
        runInAnalyticsTenantScope('org-target', async () => ({
          crossOrg: isCrossOrgUnsafe(),
          tenant: getTenantContext()?.organizationId,
        })),
    );

    expect(seen).toEqual({ crossOrg: false, tenant: 'org-target' });
  });

  it('opens the hatch only when no organization is named (superadmin all-orgs)', async () => {
    const crossOrg = await runWithTenantContext(
      { organizationId: 'org-admin' },
      () =>
        runInAnalyticsTenantScope(undefined, async () => isCrossOrgUnsafe()),
    );

    expect(crossOrg).toBe(true);
  });
});

describe('assertAnalyticsBrandInScope under the CLOUD guard', () => {
  const found = async (where: Parameters<typeof guardBrandLookup>[0]) => {
    guardBrandLookup(where);
    return { id: where.id };
  };

  it('passes for a customer brand in its own organization', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        assertAnalyticsBrandInScope(found, 'brand-1', 'org-1'),
      ),
    ).resolves.toBeUndefined();
  });

  it('passes for a superadmin naming another organization and for one naming none', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-admin' }, () =>
        assertAnalyticsBrandInScope(found, 'brand-1', 'org-target'),
      ),
    ).resolves.toBeUndefined();
    await expect(
      runWithTenantContext({ organizationId: 'org-admin' }, () =>
        assertAnalyticsBrandInScope(found, 'brand-1', undefined),
      ),
    ).resolves.toBeUndefined();
  });

  it('proves the harness: the same lookup outside the scope helper throws', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-admin' }, () =>
        guardBrandLookup({
          id: 'brand-1',
          isDeleted: false,
          organizationId: 'org-target',
        }),
      ),
    ).toThrow(TenantIsolationError);
  });

  it('still refuses a brand outside the scoped organization', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        assertAnalyticsBrandInScope(async () => null, 'brand-x', 'org-1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
