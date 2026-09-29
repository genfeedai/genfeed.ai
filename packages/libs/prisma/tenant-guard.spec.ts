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

  it('passes through the crossOrgUnsafe escape hatch even without a registered scope', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        crossOrgUnsafe(() => guardBillingAccount()),
      ),
    ).not.toThrow();
  });

  // BLOCKER fix: outside any tenant context (BullMQ processors, cron, Stripe
  // webhooks, the signup listener) a billing-account-model query must behave
  // exactly like master — no enforcement at all — even though it names a
  // billingAccountId and nothing has (or could have) registered it as an
  // active scope.
  it('does not throw with no tenant context, even naming an unregistered billingAccountId', () => {
    expect(() => guardBillingAccount()).not.toThrow();
    expect(() =>
      guardBillingAccount({
        args: {
          data: { billingAccountId: 'billing-1' },
          where: { id: 'row-1', isDeleted: false },
        },
        operation: 'updateMany',
      }),
    ).not.toThrow();
  });

  // BLOCKER fix: a query that already carries a matching organizationId
  // (credit-reservation settle copying reservation.billingAccountId into
  // `data` alongside an organization-scoped `where`, billing-accounts
  // linkOrganization's pre-scope alreadyLinked check, etc.) must fall
  // through to the existing organizationId check and never require the
  // billingAccountId to be a registered scope.

  // MAJOR 1 fix: a registered billing scope must never let an explicit,
  // mismatched organizationId elsewhere in the same query (where, data, or
  // an OR arm) slip through. The organizationId check always still runs
  // when organizationId is present anywhere.

  it('rejects an unregistered billingAccountId inside an OR arm with no organizationId anywhere', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            where: {
              OR: [
                { billingAccountId: 'billing-1' },
                { billingAccountId: 'billing-unregistered' },
              ],
            },
          },
        });
      }),
    ).toThrow(
      expect.objectContaining({ reason: 'billing-account-id-mismatch' }),
    );
  });

  // Hardening (second re-review): a billingAccountId that appears only in
  // `data`/`create` — never in `where` — must not be treated as proof, even
  // when that id is a validly registered active scope. `where` is what
  // actually selects which rows the query touches; `data`/`create` are just
  // values being written. Before this hardening, the guard collected
  // billingAccountId across the whole query (matching the organizationId
  // check's shape), which let a write reassign or label an arbitrary,
  // unrelated row with a billing account the caller happened to hold a
  // scope for, as long as nothing else in the query carried organizationId.
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
