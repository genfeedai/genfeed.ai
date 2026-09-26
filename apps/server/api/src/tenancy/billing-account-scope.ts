import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import { registerBillingAccountScope } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';

/**
 * Non-exported brand key. Nothing outside this module can produce an object
 * with this property, so `BillingAccountScope` cannot be constructed from a
 * raw `billingAccountId` string anywhere else in the codebase (#5217).
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
 * The minimal, structurally-typed slice of a Prisma client (or `$transaction`
 * callback client) `resolveBillingAccountAccess` needs. Kept narrow and
 * duck-typed, rather than importing `PrismaService`, so it composes with a
 * `tx` client inside a transaction and is trivial to fake in tests.
 */
export type BillingAccountAccessClient = {
  billingAccount: {
    findFirst(args: {
      where: { id: string; isDeleted: boolean };
    }): Promise<{ id: string; isDeleted: boolean } | null>;
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

async function requireLiveBillingAccount(
  client: BillingAccountAccessClient,
  billingAccountId: string,
): Promise<string> {
  const account = await client.billingAccount.findFirst({
    where: { id: billingAccountId, isDeleted: false },
  });
  if (!account) {
    throw new ConflictException('Billing account could not be resolved');
  }
  return account.id;
}

/** Registers the resolved id as active for the current tenant context and brands it. */
function grantScope(billingAccountId: string): BillingAccountScope {
  registerBillingAccountScope(billingAccountId);
  return brandBillingAccountScope(billingAccountId);
}

/**
 * Proves, with guard-visible organization-scoped reads, which billing account
 * `organizationId` may use, and returns an unforgeable `BillingAccountScope`
 * token (#5217).
 *
 * Mirrors `BillingAccountsService.resolveForOrganization` exactly — same
 * lookup order, same conflict/not-found conditions — because the runtime
 * tenant guard and the static `check:tenant-scope` ratchet both depend on
 * this being the sole, narrow place that turns "an organization" into "a
 * billing account it may read/write." Update both together.
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
  if (!organizationId) {
    throw new Error('resolveBillingAccountAccess: organizationId is required');
  }

  const organization = await client.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
  });
  if (!organization) {
    throw new NotFoundException('Organization');
  }

  if (organization.billingAccountId) {
    const billingAccountId = await requireLiveBillingAccount(
      client,
      organization.billingAccountId,
    );
    return grantScope(billingAccountId);
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
    const billingAccountId = await requireLiveBillingAccount(
      client,
      links[0].billingAccountId,
    );
    return grantScope(billingAccountId);
  }

  throw new NotFoundException('Billing account not found');
}
