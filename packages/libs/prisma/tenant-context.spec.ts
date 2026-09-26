import { describe, expect, it } from 'vitest';
import type { BillingAccountScopeMembership } from './tenant-context';
import {
  crossOrgUnsafe,
  getActiveBillingAccountScopes,
  getTenantContext,
  isCrossOrgUnsafe,
  registerBillingAccountScope,
  runWithTenantContext,
  withBillingAccountScopeRollback,
} from './tenant-context';

/**
 * `getActiveBillingAccountScopes()` returns a `has()`-only view (hardening,
 * #5231), not a `Set`, so these tests assert membership against an expected
 * id list instead of `.size`/`toEqual(new Set(...))`.
 */
function expectActiveScopes(
  actual: BillingAccountScopeMembership,
  expectedIds: readonly string[],
): void {
  for (const id of expectedIds) {
    expect(actual.has(id)).toBe(true);
  }
  expect(actual.has('__not-a-registered-scope__')).toBe(false);
}

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
    expectActiveScopes(getActiveBillingAccountScopes(), []);
  });

  it('is a no-op outside a tenant context (nothing to register into)', () => {
    registerBillingAccountScope('billing-1');
    expectActiveScopes(getActiveBillingAccountScopes(), []);
  });

  it('registers a billingAccountId as active for the current tenant context', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return getActiveBillingAccountScopes();
    });

    expectActiveScopes(seen, ['billing-1']);
    expectActiveScopes(getActiveBillingAccountScopes(), []);
  });

  it('accumulates multiple registered scopes in the same context', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      registerBillingAccountScope('billing-2');
      registerBillingAccountScope('  ');
      return getActiveBillingAccountScopes();
    });

    expectActiveScopes(seen, ['billing-1', 'billing-2']);
  });

  it('does not carry a registered scope into a nested runWithTenantContext', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return runWithTenantContext({ organizationId: 'org-2' }, () =>
        getActiveBillingAccountScopes(),
      );
    });

    expectActiveScopes(seen, []);
  });

  it('is visible inside the crossOrgUnsafe escape hatch', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return crossOrgUnsafe(() => getActiveBillingAccountScopes());
    });

    expectActiveScopes(seen, ['billing-1']);
  });

  it('does not expose a mutable Set through the returned view', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () => {
      registerBillingAccountScope('billing-1');
      return getActiveBillingAccountScopes();
    });

    // The view is has()-only — there is no `.add`/`.delete`/`.size` a caller
    // could use to mutate or introspect the underlying Set (hardening,
    // #5231). Object.keys should show only the `has` method, never any
    // Set-shaped internals leaking through.
    expect(Object.keys(seen)).toEqual(['has']);
    expect('add' in seen).toBe(false);
    expect('size' in seen).toBe(false);
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

    expectActiveScopes(seen, ['billing-existing', 'billing-new']);
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

    expectActiveScopes(seen, ['billing-existing']);
    expect(seen.has('billing-doomed')).toBe(false);
  });

  it('is a no-op outside a tenant context', async () => {
    await expect(
      withBillingAccountScopeRollback(async () => {
        registerBillingAccountScope('billing-1');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expectActiveScopes(getActiveBillingAccountScopes(), []);
  });

  it('propagates the resolved value on success', async () => {
    const value = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      withBillingAccountScopeRollback(async () => 'resolved'),
    );

    expect(value).toBe('resolved');
  });
});
