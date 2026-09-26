import { describe, expect, it } from 'vitest';
import {
  crossOrgUnsafe,
  registerBillingAccountScope,
  runWithTenantContext,
} from './tenant-context';
import {
  assertTenantScopedQuery,
  type TenantGuardArgs,
  TenantIsolationError,
} from './tenant-guard';
import { createTenantGuardExtension } from './tenant-guard.extension';

const TENANT_MODEL_NAMES = new Set(['Post', 'CreditBalance']);
const BILLING_ACCOUNT_MODEL_NAMES = new Set(['CreditBalance']);
const CLOUD_TENANT: Omit<TenantGuardArgs, 'args' | 'operation'> = {
  isCloud: true,
  model: 'Post',
  tenantModelNames: TENANT_MODEL_NAMES,
};
const CLOUD_BILLING_ACCOUNT_MODEL: Omit<TenantGuardArgs, 'args' | 'operation'> =
  {
    billingAccountModelNames: BILLING_ACCOUNT_MODEL_NAMES,
    isCloud: true,
    model: 'CreditBalance',
    tenantModelNames: TENANT_MODEL_NAMES,
  };

function guardBillingAccount(overrides: Partial<TenantGuardArgs> = {}): void {
  assertTenantScopedQuery({
    args: { where: { billingAccountId: 'billing-1' } },
    operation: 'findFirst',
    ...CLOUD_BILLING_ACCOUNT_MODEL,
    ...overrides,
  });
}

function guard(overrides: Partial<TenantGuardArgs> = {}): void {
  assertTenantScopedQuery({
    args: { where: { id: 'post-1' } },
    operation: 'findMany',
    ...CLOUD_TENANT,
    ...overrides,
  });
}

describe('assertTenantScopedQuery', () => {
  it('throws in CLOUD when a tenant-model query lacks organizationId and tenant context is set', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => guard()),
    ).toThrow(TenantIsolationError);

    try {
      runWithTenantContext({ organizationId: 'org-1' }, () => guard());
    } catch (error) {
      expect(error).toMatchObject({
        model: 'Post',
        name: 'TenantIsolationError',
        operation: 'findMany',
        reason: 'missing-organization-id',
      });
      return;
    }

    throw new Error('Expected TenantIsolationError');
  });

  it('passes in LOCAL even with tenant context and an unscoped tenant query', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({ isCloud: false }),
      ),
    ).not.toThrow();
  });

  it('passes for a non-tenant model in CLOUD without organizationId', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({ model: 'Organization' }),
      ),
    ).not.toThrow();
  });

  it('passes through the crossOrgUnsafe escape hatch', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        crossOrgUnsafe(() => guard()),
      ),
    ).not.toThrow();
  });

  it('does not throw in CLOUD without tenant context so workers can pass organizationId or hatch later', () => {
    expect(() => guard()).not.toThrow();
  });

  it('allows a tenant query whose organizationId matches request context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { id: 'post-1', organizationId: 'org-1' } },
        }),
      ),
    ).not.toThrow();
  });

  it('throws when the query organizationId does not match request context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { organizationId: 'org-2' } },
        }),
      ),
    ).toThrow(TenantIsolationError);

    try {
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { organizationId: { equals: 'org-2' } } },
        }),
      );
    } catch (error) {
      expect(error).toMatchObject({
        reason: 'organization-id-mismatch',
      });
      return;
    }

    throw new Error('Expected TenantIsolationError');
  });

  it('treats upsert where/create organizationId as present', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: {
            create: { organizationId: 'org-1', title: 'Hello' },
            update: { title: 'Hello' },
            where: { id: 'post-1' },
          },
          operation: 'upsert',
        }),
      ),
    ).not.toThrow();
  });

  it('does not guard create because the compile-time ratchet does not either', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { data: { title: 'Hello' } },
          operation: 'create',
        }),
      ),
    ).not.toThrow();
  });
});

describe('assertTenantScopedQuery — billing-account scope (#5217)', () => {
  it('allows a billingAccountId query whose scope is active in the tenant context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount();
      }),
    ).not.toThrow();
  });

  it('denies a billingAccountId query with no active scope registered', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guardBillingAccount(),
      ),
    ).toThrow(TenantIsolationError);

    try {
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guardBillingAccount(),
      );
    } catch (error) {
      expect(error).toMatchObject({
        model: 'CreditBalance',
        name: 'TenantIsolationError',
        reason: 'billing-account-id-mismatch',
      });
      return;
    }

    throw new Error('Expected TenantIsolationError');
  });

  it('denies a billingAccountId that does not match any active scope, even with other scopes active', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-other');
        guardBillingAccount();
      }),
    ).toThrow(TenantIsolationError);
  });

  it('denies a stale scope from an earlier, unrelated tenant context', () => {
    const scope = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return 'billing-1';
    });

    expect(() =>
      runWithTenantContext({ organizationId: 'org-2' }, () =>
        guardBillingAccount({
          args: { where: { billingAccountId: scope } },
        }),
      ),
    ).toThrow(TenantIsolationError);
  });

  it('falls through to the unchanged organizationId rule when no billingAccountId is present', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guardBillingAccount({ args: { where: { id: 'row-1' } } }),
      ),
    ).toThrow(expect.objectContaining({ reason: 'missing-organization-id' }));
  });

  it('still enforces organizationId when the model is not billing-account capable', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guard({ args: { where: { billingAccountId: 'billing-1' } } });
      }),
    ).toThrow(expect.objectContaining({ reason: 'missing-organization-id' }));
  });

  it('is unaffected when billingAccountModelNames is not provided (back-compat)', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        assertTenantScopedQuery({
          args: { where: { billingAccountId: 'billing-1' } },
          isCloud: true,
          model: 'CreditBalance',
          operation: 'findFirst',
          tenantModelNames: TENANT_MODEL_NAMES,
        }),
      ),
    ).toThrow(expect.objectContaining({ reason: 'missing-organization-id' }));
  });

  it('passes through the crossOrgUnsafe escape hatch even without a registered scope', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        crossOrgUnsafe(() => guardBillingAccount()),
      ),
    ).not.toThrow();
  });
});

describe('createTenantGuardExtension', () => {
  it('intercepts $allOperations and forwards args when the query is allowed', async () => {
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const query = async (args: unknown) => args;
    const args = { where: { organizationId: 'org-1' } };

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        extension.query.$allModels.$allOperations({
          args,
          model: 'Post',
          operation: 'findMany',
          query,
        }),
      ),
    ).resolves.toEqual(args);
  });

  it('rejects an unscoped tenant query in CLOUD before calling query', async () => {
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    let queryCalled = false;

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        extension.query.$allModels.$allOperations({
          args: { where: { id: 'post-1' } },
          model: 'Post',
          operation: 'update',
          query: async (args) => {
            queryCalled = true;
            return args;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(queryCalled).toBe(false);
  });

  it('allows a billing-account-scoped query when its scope is registered active', async () => {
    const extension = createTenantGuardExtension({
      billingAccountModelNames: BILLING_ACCOUNT_MODEL_NAMES,
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const query = async (args: unknown) => args;
    const args = { where: { billingAccountId: 'billing-1', isDeleted: false } };

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        return extension.query.$allModels.$allOperations({
          args,
          model: 'CreditBalance',
          operation: 'findFirst',
          query,
        });
      }),
    ).resolves.toEqual(args);
  });

  it('rejects a billing-account-scoped query with no active scope before calling query', async () => {
    const extension = createTenantGuardExtension({
      billingAccountModelNames: BILLING_ACCOUNT_MODEL_NAMES,
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    let queryCalled = false;

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        extension.query.$allModels.$allOperations({
          args: { where: { billingAccountId: 'billing-1' } },
          model: 'CreditBalance',
          operation: 'findFirst',
          query: async (args) => {
            queryCalled = true;
            return args;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(queryCalled).toBe(false);
  });
});
