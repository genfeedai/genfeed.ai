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
   */
  billingAccountIds?: Set<string>;
  isCrossOrgUnsafe: boolean;
  organizationId?: string;
};

const storage = new AsyncLocalStorage<TenantStore>();
const EMPTY_BILLING_ACCOUNT_IDS: ReadonlySet<string> = new Set();

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
 * calls this — it is what lets the runtime tenant guard
 * (`tenant-guard.ts`) allow a later `billingAccountScopedWhere(scope, …)`
 * query in the same request or `$transaction`. Outside any tenant context
 * (no active store) this is a deliberate no-op: there is nothing to register
 * into, and a scope resolved there is never "active" anywhere else.
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

/** The `billingAccountId`s proven active in the current tenant context. */
export function getActiveBillingAccountScopes(): ReadonlySet<string> {
  return storage.getStore()?.billingAccountIds ?? EMPTY_BILLING_ACCOUNT_IDS;
}
