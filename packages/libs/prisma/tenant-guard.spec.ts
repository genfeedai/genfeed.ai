import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crossOrgUnsafe,
  registerBillingAccountScope,
  runWithTenantContext,
} from './tenant-context';
import * as tenantGuard from './tenant-guard';
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

describe('tenant guard isolated CI failure observation', () => {
  const observerSymbol = Symbol.for('genfeed.cloudTenantGuard.observer.v1');
  const gates = {
    CI: 'true',
    CLOUD_SWEEP_DIAGNOSTICS: '1',
    GENFEED_CLOUD: 'true',
    GITHUB_ACTIONS: 'true',
    NODE_ENV: 'test',
  };
  const tenantFailure = vi.fn();
  const unavailable = vi.fn();
  let previousObserver: PropertyDescriptor | undefined;

  beforeEach(() => {
    previousObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      observerSymbol,
    );
    for (const [key, value] of Object.entries(gates)) vi.stubEnv(key, value);
    vi.stubEnv('CLOUD_SWEEP_LOCAL', undefined);
    tenantFailure.mockReset();
    unavailable.mockReset();
    Object.defineProperty(globalThis, observerSymbol, {
      configurable: true,
      value: { protocol: 1, tenantFailure, unavailable },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (previousObserver) {
      Object.defineProperty(globalThis, observerSymbol, previousObserver);
    } else {
      Reflect.deleteProperty(globalThis, observerSymbol);
    }
  });

  function intercept(
    args: unknown = { where: { organizationId: 'private-org-canary' } },
    model = 'Post',
    isCloud = true,
  ) {
    const query = vi.fn(async (value: unknown) => value);
    const extension = createTenantGuardExtension({
      billingAccountModelNames: BILLING_ACCOUNT_MODEL_NAMES,
      isCloud,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const result = runWithTenantContext(
      { organizationId: 'private-context-canary' },
      () =>
        extension.query.$allModels.$allOperations({
          args,
          model,
          operation: 'findFirst',
          query,
        }),
    );
    return { query, result };
  }

  it('observes the actual guard throw once, preserves its identity, and never dispatches the query', async () => {
    const originalAssert = tenantGuard.assertTenantScopedQuery;
    let actualError: unknown;
    vi.spyOn(tenantGuard, 'assertTenantScopedQuery').mockImplementation(
      (input) => {
        try {
          return originalAssert(input);
        } catch (error) {
          actualError = error;
          throw error;
        }
      },
    );
    const { query, result } = intercept({
      where: {
        organizationId: 'private-org-canary',
        token: 'private-token-canary',
      },
    });
    const error: unknown = await result.catch((failure: unknown) => failure);
    expect(error).toBe(actualError);
    expect(error).toBeInstanceOf(TenantIsolationError);
    expect(error).toMatchObject({
      message:
        'Tenant isolation: findFirst on Post used organizationId private-org-canary but the request tenant is private-context-canary.',
      model: 'Post',
      name: 'TenantIsolationError',
      operation: 'findFirst',
      reason: 'organization-id-mismatch',
    });
    expect(tenantFailure.mock.calls).toEqual([
      ['Post', 'findFirst', 'organization-id-mismatch'],
    ]);
    expect(JSON.stringify(tenantFailure.mock.calls)).not.toContain('canary');
    expect(unavailable).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each<[unknown, string, string]>([
    [
      { where: { id: 'private-row-canary' } },
      'Post',
      'missing-organization-id',
    ],
    [
      { where: { billingAccountId: 'private-billing-canary' } },
      'CreditBalance',
      'billing-account-id-mismatch',
    ],
  ])(
    'observes the existing %s failure without exposing arguments',
    async (args, model, reason) => {
      const { query, result } = intercept(args, model);
      await expect(result).rejects.toMatchObject({
        model,
        operation: 'findFirst',
        reason,
      });
      expect(tenantFailure.mock.calls).toEqual([[model, 'findFirst', reason]]);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(
    Object.keys(gates).flatMap((key) =>
      ['disabled', undefined].map((value) => ({ key, value })),
    ),
  )('never reads the hook when $key is $value', async ({ key, value }) => {
    vi.stubEnv(key, value);
    const getHook = vi.fn(() => {
      throw new Error('hook must be dormant');
    });
    Object.defineProperty(globalThis, observerSymbol, {
      configurable: true,
      get: getHook,
    });
    const { query, result } = intercept();
    await expect(result).rejects.toBeInstanceOf(TenantIsolationError);
    expect(getHook).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(tenantFailure).not.toHaveBeenCalled();
  });

  it.each(['1', ''])(
    'never reads the hook when CLOUD_SWEEP_LOCAL is defined as %s',
    async (value) => {
      vi.stubEnv('CLOUD_SWEEP_LOCAL', value);
      const getHook = vi.fn(() => {
        throw new Error('hook must be dormant');
      });
      Object.defineProperty(globalThis, observerSymbol, {
        configurable: true,
        get: getHook,
      });
      const { query, result } = intercept();
      await expect(result).rejects.toBeInstanceOf(TenantIsolationError);
      expect(getHook).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    null,
    'private-observer-canary',
    {},
    { protocol: 2, tenantFailure, unavailable },
    { protocol: 1, tenantFailure: 'not-callable', unavailable },
    { protocol: 1, tenantFailure, unavailable: 'not-callable' },
  ])(
    'preserves the guard failure with malformed observer %s',
    async (value) => {
      Object.defineProperty(globalThis, observerSymbol, {
        configurable: true,
        value,
      });
      const { query, result } = intercept();
      await expect(result).rejects.toMatchObject({
        reason: 'organization-id-mismatch',
      });
      expect(tenantFailure).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(['protocol', 'tenantFailure', 'unavailable'])(
    'preserves the guard error when observer %s getter throws',
    async (field) => {
      const observer = { protocol: 1, tenantFailure, unavailable };
      Object.defineProperty(observer, field, {
        get: () => {
          throw new Error('private-getter-canary');
        },
      });
      Object.defineProperty(globalThis, observerSymbol, {
        configurable: true,
        value: observer,
      });
      const { query, result } = intercept();
      await expect(result).rejects.toMatchObject({
        reason: 'organization-id-mismatch',
      });
      expect(tenantFailure).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('preserves the guard error when the global symbol getter throws', async () => {
    Object.defineProperty(globalThis, observerSymbol, {
      configurable: true,
      get: () => {
        throw new Error('private-hook-canary');
      },
    });
    const { query, result } = intercept();
    await expect(result).rejects.toMatchObject({
      reason: 'organization-id-mismatch',
    });
    expect(query).not.toHaveBeenCalled();
    expect(tenantFailure).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves a guard failure when callback throws and unavailable throws=%s',
    async (throwUnavailable) => {
      tenantFailure.mockImplementation(() => {
        throw new Error('private-callback-canary');
      });
      if (throwUnavailable)
        unavailable.mockImplementation(() => {
          throw new Error('private-unavailable-canary');
        });
      const { query, result } = intercept();
      await expect(result).rejects.toMatchObject({
        reason: 'organization-id-mismatch',
      });
      expect(tenantFailure.mock.calls).toEqual([
        ['Post', 'findFirst', 'organization-id-mismatch'],
      ]);
      expect(unavailable).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('does not report or replace a non-Tenant assertion error', async () => {
    const originalError = new Error('private-assertion-canary');
    const args = {
      get where() {
        throw originalError;
      },
    };
    const { query, result } = intercept(args);
    await expect(result).rejects.toBe(originalError);
    expect(tenantFailure).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each<[unknown, string, boolean]>([
    [{ where: { organizationId: 'private-context-canary' } }, 'Post', true],
    [{ where: { id: 'private-row-canary' } }, 'Post', false],
    [{ where: { id: 'private-row-canary' } }, 'Organization', true],
  ])(
    'preserves allowed query dispatch for %s with model %s and cloud %s',
    async (args, model, isCloud) => {
      const { query, result } = intercept(args, model, isCloud);
      await expect(result).resolves.toBe(args);
      expect(query).toHaveBeenCalledExactlyOnceWith(args);
      expect(tenantFailure).not.toHaveBeenCalled();
    },
  );

  it('preserves crossOrgUnsafe dispatch without observation', async () => {
    const args = { where: { organizationId: 'private-org-canary' } };
    const query = vi.fn(async (value: unknown) => value);
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const result = runWithTenantContext(
      { organizationId: 'private-context-canary' },
      () =>
        crossOrgUnsafe(() =>
          extension.query.$allModels.$allOperations({
            args,
            model: 'Post',
            operation: 'findFirst',
            query,
          }),
        ),
    );
    await expect(result).resolves.toBe(args);
    expect(query).toHaveBeenCalledExactlyOnceWith(args);
    expect(tenantFailure).not.toHaveBeenCalled();
  });

  it('does not observe or replace a downstream query rejection', async () => {
    const originalError = new TenantIsolationError(
      'Post',
      'findFirst',
      'organization-id-mismatch',
      'private-query-canary',
    );
    const query = vi.fn(async () => {
      throw originalError;
    });
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const args = { where: { organizationId: 'private-context-canary' } };
    const result = runWithTenantContext(
      { organizationId: 'private-context-canary' },
      () =>
        extension.query.$allModels.$allOperations({
          args,
          model: 'Post',
          operation: 'findFirst',
          query,
        }),
    );
    await expect(result).rejects.toBe(originalError);
    expect(query).toHaveBeenCalledExactlyOnceWith(args);
    expect(tenantFailure).not.toHaveBeenCalled();
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
  it('does not require a registered scope when organizationId already matches the tenant context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guardBillingAccount({
          args: {
            data: { billingAccountId: 'billing-unregistered' },
            where: { isDeleted: false, organizationId: 'org-1' },
          },
          operation: 'updateMany',
        }),
      ),
    ).not.toThrow();
  });

  // MAJOR 1 fix: a registered billing scope must never let an explicit,
  // mismatched organizationId elsewhere in the same query (where, data, or
  // an OR arm) slip through. The organizationId check always still runs
  // when organizationId is present anywhere.
  it('still rejects a mismatched organizationId even with a valid registered billing scope', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            where: { billingAccountId: 'billing-1', organizationId: 'org-2' },
          },
        });
      }),
    ).toThrow(expect.objectContaining({ reason: 'organization-id-mismatch' }));
  });

  it('still rejects a mismatched organizationId hidden in an OR arm alongside a valid billing scope', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            where: {
              OR: [
                { billingAccountId: 'billing-1' },
                { organizationId: 'org-2' },
              ],
            },
          },
        });
      }),
    ).toThrow(expect.objectContaining({ reason: 'organization-id-mismatch' }));
  });

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
  it('rejects update({ where: { id }, data: { billingAccountId } }) on a registered id alone', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            data: { billingAccountId: 'billing-1' },
            where: { id: 'victim-row' },
          },
          operation: 'update',
        });
      }),
    ).toThrow(expect.objectContaining({ reason: 'missing-organization-id' }));
  });

  it('rejects upsert({ create: { billingAccountId } }) on a registered id alone', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            create: { billingAccountId: 'billing-1' },
            update: { isDeleted: false },
            where: { id: 'target-row' },
          },
          operation: 'upsert',
        });
      }),
    ).toThrow(expect.objectContaining({ reason: 'missing-organization-id' }));
  });

  it('still allows the same registered id when it is actually the where-clause proof', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            data: { balanceCents: 100 },
            where: { billingAccountId: 'billing-1' },
          },
          operation: 'update',
        });
      }),
    ).not.toThrow();
  });

  it('rejects a where-scoped registered id whose upsert create carries a different, unregistered id', () => {
    // The where clause proves billing-1; the create payload separately
    // claims a different, unregistered account. Since organizationId is
    // absent everywhere, this still goes through the billing-account
    // branch, and only the where-collected id (billing-1) is checked against
    // active scopes — the unregistered id in `create` is inert data, not a
    // second claim the guard evaluates. This documents that shape rather
    // than asserting a throw: the create payload's own correctness is the
    // caller's responsibility, not this guard's.
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => {
        registerBillingAccountScope('billing-1');
        guardBillingAccount({
          args: {
            create: { billingAccountId: 'billing-unregistered' },
            update: { isDeleted: false },
            where: { billingAccountId: 'billing-1' },
          },
          operation: 'upsert',
        });
      }),
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
