import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import {
  getTenantContext,
  registerBillingAccountScope,
} from '@libs/prisma/tenant-context';
import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * Non-exported brand key, kept on the TYPE for compile-time nominal typing
 * only — `BillingAccountScope` cannot be *written* as a literal anywhere
 * outside this module without the symbol in scope, so a plain
 * `{ billingAccountId: 'x' } as BillingAccountScope` still fails to type-check.
 *
 * It is deliberately NOT the runtime authority any more (hardening after the
 * second review pass): a symbol-keyed property is still an *enumerable* own
 * property, so `{ ...realScope, billingAccountId: 'victim' }` copies it
 * straight through an object spread, forging a scope for an arbitrary id
 * with the real scope's brand attached. See `ISSUED_BILLING_ACCOUNT_SCOPES`
 * below for the actual runtime check.
 */
const BILLING_ACCOUNT_SCOPE_BRAND: unique symbol = Symbol(
  'BillingAccountScope',
);

/**
 * Proof that the current caller's organization may use `billingAccountId`.
 * Issued only by `resolveBillingAccountAccess`. Pass it to
 * `billingAccountScopedWhere` (see `./scoped-where`) to build a Prisma
 * `where` for a billing-account-shared model.
 */
export type BillingAccountScope = {
  readonly billingAccountId: string;
  readonly [BILLING_ACCOUNT_SCOPE_BRAND]: true;
};

/**
 * Every scope object this module has actually issued via
 * `brandBillingAccountScope`, tracked by object identity rather than by any
 * property the object carries (#5217, MAJOR 2; hardening after the second
 * review pass). This is what makes the brand unforgeable at runtime:
 *
 * - Object-identity (`WeakSet`) membership can't be produced by copying
 *   properties — `{ ...realScope, billingAccountId: 'victim' }` is a *new*
 *   object, never added to this set, so it fails `isBillingAccountScope`
 *   even though it still carries the (enumerable, guessable-by-symbol-leak)
 *   brand property.
 * - `Object.freeze()` in `brandBillingAccountScope` closes the remaining
 *   gap: without it, mutating a *real* scope's `billingAccountId` in place
 *   (same object identity, still WeakSet-registered) would pass this check
 *   for whatever id was written last.
 * - `WeakSet` (not `Set`) so an issued-but-discarded scope can still be
 *   garbage-collected; nothing here needs to enumerate issued scopes, only
 *   test membership.
 */
const ISSUED_BILLING_ACCOUNT_SCOPES = new WeakSet<object>();

/** Runtime check that `value` was actually issued by this module (#5217, MAJOR 2). */
export function isBillingAccountScope(
  value: unknown,
): value is BillingAccountScope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!ISSUED_BILLING_ACCOUNT_SCOPES.has(value)) {
    return false;
  }

  const candidate = value as Record<PropertyKey, unknown>;
  return (
    typeof candidate.billingAccountId === 'string' &&
    candidate.billingAccountId.length > 0
  );
}

/**
 * The minimal, structurally-typed slice of a Prisma client (or `$transaction`
 * callback client) the resolution logic needs. Kept narrow and duck-typed,
 * rather than importing `PrismaService`, so it composes with a `tx` client
 * inside a transaction and is trivial to fake in tests. Generic over the
 * `BillingAccount` row shape so `BillingAccountsService.resolveForOrganization`
 * can share this exact resolution logic (#5217, MAJOR 2) while still getting
 * back the full Prisma row it has always returned, not just a scope.
 */
export type BillingAccountAccessClient<
  Account extends { id: string; isDeleted: boolean } = {
    id: string;
    isDeleted: boolean;
  },
> = {
  billingAccount: {
    findFirst(args: {
      where: { id: string; isDeleted: boolean };
    }): Promise<Account | null>;
  };
  billingAccountOrganization: {
    findMany(args: {
      where: {
        isDeleted: boolean;
        organizationId: string;
        status: BillingAccountOrganizationStatus;
      };
    }): Promise<Array<{ billingAccountId: string }>>;
  };
  organization: {
    findFirst(args: {
      where: { id: string; isDeleted: boolean };
    }): Promise<{ billingAccountId: string | null } | null>;
  };
};

function brandBillingAccountScope(
  billingAccountId: string,
): BillingAccountScope {
  const scope: BillingAccountScope = {
    billingAccountId,
    [BILLING_ACCOUNT_SCOPE_BRAND]: true,
  };

  // Freeze before registering: once issued, nothing (including this module)
  // can mutate `billingAccountId` in place on a still-WeakSet-registered
  // object and have it pass isBillingAccountScope for a different id.
  Object.freeze(scope);
  ISSUED_BILLING_ACCOUNT_SCOPES.add(scope);
  return scope;
}

/**
 * `resolveBillingAccountAccess`/`resolveLiveBillingAccount` take an
 * `organizationId` parameter rather than reading it from the tenant context
 * themselves, so they work outside any HTTP request too (webhooks, cron).
 * But when there *is* an active tenant context, it MUST agree — otherwise a
 * caller could pass any organizationId string (not necessarily the
 * authenticated session's own) and mint a scope for a billing account that
 * organization has no session-level right to touch (#5217, MAJOR 2). Outside
 * any tenant context this is a no-op: there is nothing to check against, and
 * the caller (a background job) is establishing its own trust.
 */
function assertOrganizationMatchesTenantContext(organizationId: string): void {
  const tenantContext = getTenantContext();
  if (tenantContext && tenantContext.organizationId !== organizationId) {
    throw new ForbiddenException(
      'Organization does not match the authenticated tenant context',
    );
  }
}

async function requireLiveBillingAccount<
  Account extends { id: string; isDeleted: boolean },
>(
  client: BillingAccountAccessClient<Account>,
  billingAccountId: string,
): Promise<Account> {
  const account = await client.billingAccount.findFirst({
    where: { id: billingAccountId, isDeleted: false },
  });
  if (!account) {
    throw new ConflictException('Billing account could not be resolved');
  }
  return account;
}

type ResolvedBillingAccountAccess<Account> = {
  account: Account;
  scope: BillingAccountScope;
};

/**
 * Proves, with guard-visible organization-scoped reads, which billing account
 * `organizationId` may use, registers it as active in the current tenant
 * context, and returns both the full row and the branded scope (#5217).
 *
 * This is the sole resolution logic — `resolveBillingAccountAccess` (returns
 * just the scope) and `BillingAccountsService.resolveForOrganization`
 * (returns the full row, as it always has) are both thin wrappers around it,
 * so the runtime tenant guard and the static `check:tenant-scope` ratchet
 * only ever have one lookup order/conflict policy to reason about. Update
 * this one function for both.
 */
async function resolveBillingAccountAccessInternal<
  Account extends { id: string; isDeleted: boolean },
>(
  organizationId: string,
  client: BillingAccountAccessClient<Account>,
): Promise<ResolvedBillingAccountAccess<Account>> {
  if (!organizationId) {
    throw new Error('resolveBillingAccountAccess: organizationId is required');
  }

  assertOrganizationMatchesTenantContext(organizationId);

  const organization = await client.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
  });
  if (!organization) {
    throw new NotFoundException('Organization');
  }

  if (organization.billingAccountId) {
    const account = await requireLiveBillingAccount(
      client,
      organization.billingAccountId,
    );
    registerBillingAccountScope(account.id);
    return { account, scope: brandBillingAccountScope(account.id) };
  }

  const links = await client.billingAccountOrganization.findMany({
    where: {
      isDeleted: false,
      organizationId,
      status: BillingAccountOrganizationStatus.LINKED,
    },
  });
  if (links.length > 1) {
    throw new ConflictException('Billing account could not be resolved');
  }
  if (links.length === 1) {
    const account = await requireLiveBillingAccount(
      client,
      links[0].billingAccountId,
    );
    registerBillingAccountScope(account.id);
    return { account, scope: brandBillingAccountScope(account.id) };
  }

  throw new NotFoundException('Billing account not found');
}

/**
 * Proves which billing account `organizationId` may use and returns an
 * unforgeable `BillingAccountScope` token (#5217). See
 * `resolveBillingAccountAccessInternal` for the shared lookup logic.
 *
 * Resolving successfully also registers `billingAccountId` as active in the
 * current async tenant context (see `@libs/prisma/tenant-context`), which is
 * what lets a later `billingAccountScopedWhere(scope, …)` query in the same
 * request or `$transaction` pass the runtime guard. A scope resolved in one
 * request/transaction is not active in another — the token itself proves
 * nothing at rest; only an active, matching registration does.
 */
export async function resolveBillingAccountAccess(
  organizationId: string,
  client: BillingAccountAccessClient,
): Promise<BillingAccountScope> {
  const { scope } = await resolveBillingAccountAccessInternal(
    organizationId,
    client,
  );
  return scope;
}

/**
 * Same resolution as `resolveBillingAccountAccess`, returning the full
 * `BillingAccount` row instead of a scope — what
 * `BillingAccountsService.resolveForOrganization` has always returned to its
 * many callers (label, status, planTier, stripeCustomerId, …). Also
 * registers the resolved `billingAccountId` as an active scope, so a caller
 * that already holds the full row (no separate `resolveBillingAccountAccess`
 * call needed) can still use `billingAccountScopedWhere` afterward.
 */
export async function resolveLiveBillingAccount<
  Account extends { id: string; isDeleted: boolean },
>(
  organizationId: string,
  client: BillingAccountAccessClient<Account>,
): Promise<Account> {
  const { account } = await resolveBillingAccountAccessInternal(
    organizationId,
    client,
  );
  return account;
}
