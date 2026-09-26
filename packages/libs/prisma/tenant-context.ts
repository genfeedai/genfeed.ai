import { AsyncLocalStorage } from 'node:async_hooks';

export type PrismaTenantContext = {
  organizationId: string;
};

type TenantStore = {
  /**
   * `billingAccountId`s proven "active" this request/transaction by
   * `resolveBillingAccountAccess` (#5217). Lazily created — most requests
   * never touch billing-account-shared data — and mutated in place on the
   * live store so a scope registered mid-request is visible to every later
   * query in the same async chain, including inside a `$transaction`
   * callback. It is intentionally NOT carried across a new
   * `runWithTenantContext` call: switching tenant context re-requires proof.
   *
   * This Set is shared by every concurrent branch of the same tenant context
   * — including sibling `Promise.all` branches, which do not fork the async
   * context. Registering inside one branch makes the scope visible to the
   * others immediately (usually desirable: they're the same request). Use
   * `withBillingAccountScopeRollback` only around a single, sequential unit
   * of work — wrapping concurrent branches would let one branch's rollback
   * discard scopes a sibling branch legitimately registered.
   */
  billingAccountIds?: Set<string>;
  isCrossOrgUnsafe: boolean;
  organizationId?: string;
};

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * A read-only membership check over the active `BillingAccountScope`s for
 * the current tenant context. Deliberately not `ReadonlySet<string>`: that
 * type is a compile-time-only restriction — the live `Set` underneath is
 * still trivially reachable and mutable via a cast (`as Set<string>`), so a
 * caller outside `registerBillingAccountScope` could otherwise add or clear
 * scopes without going through the one function CI's import ratchet
 * enforces. Exposing only `has()` removes that escape hatch: there is no
 * value this view returns that a caller can widen back into the underlying
 * `Set`.
 */
export type BillingAccountScopeMembership = {
  has(billingAccountId: string): boolean;
};

const EMPTY_BILLING_ACCOUNT_SCOPES: BillingAccountScopeMembership = {
  has: () => false,
};

/** Trims a tenant identifier (`organizationId` or `billingAccountId`) to `undefined` when blank. */
function sanitizeId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function currentStore(): TenantStore {
  return (
    storage.getStore() ?? {
      isCrossOrgUnsafe: false,
    }
  );
}

export function getTenantContext(): PrismaTenantContext | undefined {
  const organizationId = sanitizeId(currentStore().organizationId);
  return organizationId ? { organizationId } : undefined;
}

export function isCrossOrgUnsafe(): boolean {
  return currentStore().isCrossOrgUnsafe === true;
}

export function runWithTenantContext<T>(
  context: PrismaTenantContext,
  callback: () => T,
): T {
  const organizationId = sanitizeId(context.organizationId);
  if (!organizationId) {
    throw new Error('runWithTenantContext: organizationId is required');
  }

  const parent = currentStore();
  return storage.run(
    {
      isCrossOrgUnsafe: parent.isCrossOrgUnsafe,
      organizationId,
    },
    callback,
  );
}

/**
 * Named, greppable escape hatch for legitimate cross-org Prisma queries in
 * CLOUD mode (platform admin, system workflows). Do not add a silent boolean.
 */
export function crossOrgUnsafe<T>(callback: () => T): T {
  const parent = currentStore();
  return storage.run(
    {
      billingAccountIds: parent.billingAccountIds,
      isCrossOrgUnsafe: true,
      organizationId: parent.organizationId,
    },
    callback,
  );
}

/**
 * Registers `billingAccountId` as an active `BillingAccountScope` for the
 * current async tenant context (#5217). Only `resolveBillingAccountAccess`
 * (`apps/server/api/src/tenancy/billing-account-scope.ts`) may call this —
 * `bun run check:billing-account-scope-registration` fails CI on any other
 * call site — because it is what lets the runtime tenant guard
 * (`tenant-guard.ts`) allow a later `billingAccountScopedWhere(scope, …)`
 * query in the same request or `$transaction`. A raw string passed here has
 * none of `resolveBillingAccountAccess`'s org-scoped proof behind it, so
 * nothing outside that one function may mint a registration. Outside any
 * tenant context (no active store) this is a deliberate no-op: there is
 * nothing to register into, and a scope resolved there is never "active"
 * anywhere else.
 */
export function registerBillingAccountScope(billingAccountId: string): void {
  const sanitized = sanitizeId(billingAccountId);
  if (!sanitized) {
    return;
  }

  const store = storage.getStore();
  if (!store) {
    return;
  }

  if (!store.billingAccountIds) {
    store.billingAccountIds = new Set();
  }

  store.billingAccountIds.add(sanitized);
}

/**
 * Whether `billingAccountId`s are proven active in the current tenant
 * context. Returns a `has()`-only view rather than the live `Set` (see
 * `BillingAccountScopeMembership`) so no caller of this getter — including
 * the runtime guard itself — can mutate or replace the underlying scope
 * store; only `registerBillingAccountScope` can.
 */
export function getActiveBillingAccountScopes(): BillingAccountScopeMembership {
  const billingAccountIds = storage.getStore()?.billingAccountIds;
  if (!billingAccountIds) {
    return EMPTY_BILLING_ACCOUNT_SCOPES;
  }

  return {
    has: (billingAccountId: string) => billingAccountIds.has(billingAccountId),
  };
}

/**
 * Runs `operation` and, if it throws, restores the active
 * `BillingAccountScope` set to what it was beforehand — discarding any scope
 * `resolveBillingAccountAccess` registered mid-operation (#5217). Use this
 * around a single `$transaction` callback that resolves a scope partway
 * through and then may itself roll back: without it, a scope resolved from
 * the transaction's own (about-to-be-discarded) uncommitted writes would
 * incorrectly stay "active" for the rest of the request even though the
 * write it depended on never became durable.
 *
 * Only for sequential work. Wrapping concurrent branches (`Promise.all`) is
 * unsafe: they share this same Set (see `TenantStore.billingAccountIds`), so
 * restoring the pre-operation snapshot on one branch's failure would also
 * discard a sibling branch's legitimate, independent registration.
 */
export async function withBillingAccountScopeRollback<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const store = storage.getStore();
  const snapshot = store?.billingAccountIds
    ? new Set(store.billingAccountIds)
    : undefined;

  try {
    return await operation();
  } catch (error) {
    if (store) {
      store.billingAccountIds = snapshot;
    }
    throw error;
  }
}
