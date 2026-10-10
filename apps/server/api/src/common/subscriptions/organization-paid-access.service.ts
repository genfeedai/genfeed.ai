import {
  type PaidSubscriptionGrant,
  resolveOrganizationPaidGrant,
} from '@api/common/subscriptions/paid-subscription-access.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BillingAccountScope,
  resolveBillingAccountAccess,
} from '@api/tenancy/billing-account-scope';
import { billingAccountScopedWhere } from '@api/tenancy/scoped-where';
import { hasOrganizationBilling } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PAID_GRANT_CACHE_TTL_MS = 30_000;
const SUBSCRIPTION_READ_LIMIT = 20;

const SUBSCRIPTION_SELECT = {
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  plan: true,
  status: true,
} as const;

/**
 * Cached "does this organization pay for a plan" read for per-request gates.
 * Decides through {@link resolveOrganizationPaidGrant}: an active paid
 * subscription, a cancellation still inside its paid period, or a paid tier
 * with no subscription row (an operator-granted tier — `subscriptionTier` is
 * billing-controlled: only a superadmin can write it over HTTP, and
 * `StripeSubscriptionWebhookHandler.handleSubscriptionDeleted` resets it to
 * `free` in the same call that soft-deletes the row, so a cancelled
 * organization with zero rows always reads a free tier). An organization
 * also pays through a linked billing account (#5231) — its own subscription
 * rows grant paid access the same way, read through the tenant-guard-visible
 * billing-account scope helpers rather than a bare `billingAccountId` filter.
 *
 * The billing account's own `planTier` is deliberately **not** used as a
 * zero-row fallback the way an organization's own tier is: nothing in this
 * codebase keeps `BillingAccount.planTier` current after the account is
 * created (no admin/API route writes it, and the #5231 migration's one-time
 * backfill froze every pre-existing organization's personal billing account
 * at whatever tier it had on migration day). Trusting it here would let an
 * organization that cancels keep paid access forever once its billing
 * account's subscription rows are gone.
 *
 * Features that sit behind a subscription (BYOK, the unlocked agent model
 * picker) ask {@link isSubscriptionGated} so deployments without
 * organization billing (community self-host, desktop) are never gated.
 */
@Injectable()
export class OrganizationPaidAccessService {
  private readonly context = { service: OrganizationPaidAccessService.name };
  private readonly paidGrantCache = new Map<
    string,
    { expiresAt: number; isPaid: boolean }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * True when a subscription-only feature must be withheld: the deployment
   * bills organizations and this organization has no paid grant.
   */
  async isSubscriptionGated(organizationId: string): Promise<boolean> {
    if (!hasOrganizationBilling()) {
      return false;
    }
    return !(await this.hasPaidSubscription(organizationId));
  }

  /** Financial route selection must distinguish confirmed lack of entitlement from read failure. */
  async isSubscriptionGatedStrict(organizationId: string): Promise<boolean> {
    if (!hasOrganizationBilling()) return false;
    return !(await this.hasPaidSubscriptionStrict(organizationId));
  }

  /** Execution admission re-reads a grant even inside the normal request cache TTL. */
  async isSubscriptionGatedFresh(organizationId: string): Promise<boolean> {
    if (!hasOrganizationBilling()) return false;
    this.paidGrantCache.delete(organizationId);
    return this.isSubscriptionGatedStrict(organizationId);
  }

  async hasPaidSubscription(organizationId: string): Promise<boolean> {
    try {
      return await this.hasPaidSubscriptionStrict(organizationId);
    } catch (error: unknown) {
      // Legacy feature gates fail closed without caching an uncertain result.
      this.logger.warn('Organization paid access: subscription read failed', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return false;
    }
  }

  async hasPaidSubscriptionStrict(organizationId: string): Promise<boolean> {
    const cached = this.paidGrantCache.get(organizationId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.isPaid;
    }

    const [subscriptions, settings] = await Promise.all([
      this.prisma.subscription.findMany({
        select: SUBSCRIPTION_SELECT,
        take: SUBSCRIPTION_READ_LIMIT,
        where: { isDeleted: false, organizationId },
      }),
      this.prisma.organizationSetting.findFirst({
        select: { subscriptionTier: true },
        where: { organizationId },
      }),
    ]);

    const ownGrant = resolveOrganizationPaidGrant(
      subscriptions,
      settings?.subscriptionTier ?? null,
      new Date(now),
    );

    // The organization's own read already grants access — skip the
    // billing-account round trip entirely.
    const billingAccountGrant =
      ownGrant !== null
        ? null
        : await this.resolveBillingAccountGrant(organizationId, new Date(now));

    const isPaid = ownGrant !== null || billingAccountGrant !== null;
    this.paidGrantCache.set(organizationId, {
      expiresAt: now + PAID_GRANT_CACHE_TTL_MS,
      isPaid,
    });
    return isPaid;
  }

  /**
   * The grant carried by `organizationId`'s linked billing account, if any:
   * its own non-deleted subscription rows only — never its `planTier` (see
   * the class doc). `null` when no billing account is linked, the common
   * case for most organizations and not a failure. Any other lookup failure
   * (an ambiguous multiple-link conflict, a missing organization row)
   * propagates to `hasPaidSubscription`'s catch so the whole read fails
   * closed, same as an organization's own subscription read failing.
   */
  private async resolveBillingAccountGrant(
    organizationId: string,
    now: Date,
  ): Promise<PaidSubscriptionGrant | null> {
    const scope = await this.resolveBillingAccountScope(organizationId);
    if (!scope) {
      return null;
    }

    const subscriptions = await this.prisma.subscription.findMany({
      select: SUBSCRIPTION_SELECT,
      take: SUBSCRIPTION_READ_LIMIT,
      where: billingAccountScopedWhere(scope, {}),
    });

    // `null` tier: the billing account's own subscription rows are the only
    // signal here (see the class doc for why `planTier` is excluded).
    return resolveOrganizationPaidGrant(subscriptions, null, now);
  }

  private async resolveBillingAccountScope(
    organizationId: string,
  ): Promise<BillingAccountScope | null> {
    try {
      return await resolveBillingAccountAccess(organizationId, this.prisma);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }
}
