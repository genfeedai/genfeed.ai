import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import {
  getTenantContext,
  registerBillingAccountScope,
} from '@libs/prisma/tenant-context';
import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * Non-exported brand key. Nothing outside this module can produce an object
 * with this property, so `BillingAccountScope` cannot be constructed from a
 * raw `billingAccountId` string anywhere else in the codebase (#5217). Also
 * used at runtime by `isBillingAccountScope` — a plain object shaped like a
 * scope but built with `as`/`as unknown as BillingAccountScope` still lacks
 * this actual property, so `billingAccountScopedWhere` (see
 * `./scoped-where`) can catch a forged token instead of trusting the type
 * system alone.
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

/** Runtime check that `value` actually carries the brand (#5217, MAJOR 2). */
export function isBillingAccountScope(
  value: unknown,
): value is BillingAccountScope {
  return (
    typeof value === 'object' &&
    value !== null &&
    BILLING_ACCOUNT_SCOPE_BRAND in value &&
    (value as Record<string, unknown>)[BILLING_ACCOUNT_SCOPE_BRAND] === true &&
    typeof (value as { billingAccountId?: unknown }).billingAccountId ===
      'string' &&
    (value as { billingAccountId: string }).billingAccountId.length > 0
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
  return {
    billingAccountId,
    [BILLING_ACCOUNT_SCOPE_BRAND]: true,
  };
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
