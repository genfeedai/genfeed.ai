import { describe, expect, it } from 'vitest';
import {
  crossOrgUnsafe,
  getActiveBillingAccountScopes,
  getTenantContext,
  isCrossOrgUnsafe,
  registerBillingAccountScope,
  runWithTenantContext,
  withBillingAccountScopeRollback,
} from './tenant-context';

describe('tenant context', () => {
  it('is empty outside a store', () => {
    expect(getTenantContext()).toBeUndefined();
    expect(isCrossOrgUnsafe()).toBe(false);
  });

  it('exposes the request organizationId inside runWithTenantContext', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () =>
      getTenantContext(),
    );
    expect(seen).toEqual({ organizationId: 'org-1' });
    expect(getTenantContext()).toBeUndefined();
  });

  it('keeps tenant context while the crossOrgUnsafe hatch is open', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () =>
      crossOrgUnsafe(() => ({
        isUnsafe: isCrossOrgUnsafe(),
        tenant: getTenantContext(),
      })),
    );

    expect(seen).toEqual({
      isUnsafe: true,
      tenant: { organizationId: 'org-1' },
    });
    expect(isCrossOrgUnsafe()).toBe(false);
  });

  it('rejects an empty organizationId', () => {
    expect(() =>
      runWithTenantContext({ organizationId: '   ' }, () => undefined),
    ).toThrow('runWithTenantContext: organizationId is required');
  });
});

describe('billing account scope registration', () => {
  it('is empty outside a tenant context', () => {
    expect(getActiveBillingAccountScopes().size).toBe(0);
  });

  it('is a no-op outside a tenant context (nothing to register into)', () => {
    registerBillingAccountScope('billing-1');
    expect(getActiveBillingAccountScopes().size).toBe(0);
  });

  it('registers a billingAccountId as active for the current tenant context', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return getActiveBillingAccountScopes();
    });

    expect(seen).toEqual(new Set(['billing-1']));
    expect(getActiveBillingAccountScopes().size).toBe(0);
  });

  it('accumulates multiple registered scopes in the same context', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      registerBillingAccountScope('billing-2');
      registerBillingAccountScope('  ');
      return getActiveBillingAccountScopes();
    });

    expect(seen).toEqual(new Set(['billing-1', 'billing-2']));
  });

  it('does not carry a registered scope into a nested runWithTenantContext', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return runWithTenantContext({ organizationId: 'org-2' }, () =>
        getActiveBillingAccountScopes(),
      );
    });

    expect(seen.size).toBe(0);
  });

  it('is visible inside the crossOrgUnsafe escape hatch', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return crossOrgUnsafe(() => getActiveBillingAccountScopes());
    });

    expect(seen).toEqual(new Set(['billing-1']));
  });
});

describe('withBillingAccountScopeRollback', () => {
  it('keeps a scope registered when the operation succeeds', async () => {
    const seen = await runWithTenantContext(
      { organizationId: 'org-1' },
      async () => {
        registerBillingAccountScope('billing-existing');
        await withBillingAccountScopeRollback(async () => {
          registerBillingAccountScope('billing-new');
        });
        return getActiveBillingAccountScopes();
      },
    );

    expect(seen).toEqual(new Set(['billing-existing', 'billing-new']));
  });

  it('discards a scope registered mid-operation when it throws (rolled-back transaction)', async () => {
    const seen = await runWithTenantContext(
      { organizationId: 'org-1' },
      async () => {
        registerBillingAccountScope('billing-existing');
        await expect(
          withBillingAccountScopeRollback(async () => {
            registerBillingAccountScope('billing-doomed');
            throw new Error('transaction rolled back');
          }),
        ).rejects.toThrow('transaction rolled back');
        return getActiveBillingAccountScopes();
      },
    );

    expect(seen).toEqual(new Set(['billing-existing']));
  });

  it('is a no-op outside a tenant context', async () => {
    await expect(
      withBillingAccountScopeRollback(async () => {
        registerBillingAccountScope('billing-1');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getActiveBillingAccountScopes().size).toBe(0);
  });

  it('propagates the resolved value on success', async () => {
    const value = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      withBillingAccountScopeRollback(async () => 'resolved'),
    );

    expect(value).toBe('resolved');
  });
});
