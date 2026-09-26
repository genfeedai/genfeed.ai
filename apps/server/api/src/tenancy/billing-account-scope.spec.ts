import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  type BillingAccountAccessClient,
  isBillingAccountScope,
  resolveBillingAccountAccess,
  resolveLiveBillingAccount,
} from './billing-account-scope';

function fakeClient(
  overrides: Partial<BillingAccountAccessClient> = {},
): BillingAccountAccessClient {
  return {
    billingAccount: {
      findFirst: async ({ where }) => ({ id: where.id, isDeleted: false }),
    },
    billingAccountOrganization: { findMany: async () => [] },
    organization: {
      findFirst: async ({ where }) => ({
        billingAccountId: 'billing-1',
        id: where.id,
      }),
    },
    ...overrides,
  };
}

describe('resolveBillingAccountAccess — tenant context enforcement (#5217, MAJOR 2)', () => {
  it('resolves when there is no active tenant context (background job)', async () => {
    const scope = await resolveBillingAccountAccess('org-1', fakeClient());
    expect(scope.billingAccountId).toBe('billing-1');
  });

  it('resolves when organizationId matches the active tenant context', async () => {
    const scope = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      resolveBillingAccountAccess('org-1', fakeClient()),
    );
    expect(scope.billingAccountId).toBe('billing-1');
  });

  it('rejects an organizationId that does not match the active tenant context', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        resolveBillingAccountAccess('org-2', fakeClient()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies the same tenant-context check to resolveLiveBillingAccount', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        resolveLiveBillingAccount('org-2', fakeClient()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const account = await runWithTenantContext(
      { organizationId: 'org-1' },
      () => resolveLiveBillingAccount('org-1', fakeClient()),
    );
    expect(account.id).toBe('billing-1');
  });
});

describe('isBillingAccountScope', () => {
  it('accepts a scope resolveBillingAccountAccess actually issued', async () => {
    const scope = await resolveBillingAccountAccess('org-1', fakeClient());
    expect(isBillingAccountScope(scope)).toBe(true);
  });

  it('rejects a plain object shaped like a scope', () => {
    expect(isBillingAccountScope({ billingAccountId: 'billing-1' })).toBe(
      false,
    );
  });

  it('rejects non-objects', () => {
    expect(isBillingAccountScope('billing-1')).toBe(false);
    expect(isBillingAccountScope(null)).toBe(false);
    expect(isBillingAccountScope(undefined)).toBe(false);
  });
});
