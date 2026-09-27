import {
  type PaidSubscriptionGrant,
  resolveOrganizationPaidGrant,
} from '@api/common/subscriptions/paid-subscription-access.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type BillingAccountScope,
  billingAccountScopedWhere,
  resolveBillingAccountAccess,
  resolveLiveBillingAccount,
} from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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

type ResolvedBillingAccountScope = {
  account: { planTier: string | null };
  scope: BillingAccountScope;
};

/**
 * Cached "does this organization pay for a plan" read for per-request gates.
 * Decides through {@link resolveOrganizationPaidGrant}: an active paid
 * subscription, a cancellation still inside its paid period, or a paid tier
 * with no subscription row (an operator-granted tier). An organization also
 * pays through a linked billing account (#5231) — its own subscriptions and
 * tier grant paid access exactly the same way, read through the
 * tenant-guard-visible billing-account scope helpers rather than a bare
 * `billingAccountId` filter. Features that sit behind a subscription (BYOK,
 * the unlocked agent model picker) ask {@link isSubscriptionGated} so
 * deployments without organization billing (community self-host, desktop)
 * are never gated.
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

  async hasPaidSubscription(organizationId: string): Promise<boolean> {
    const cached = this.paidGrantCache.get(organizationId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.isPaid;
    }

    let isPaid = false;
    try {
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
          : await this.resolveBillingAccountGrant(
              organizationId,
              new Date(now),
            );

      isPaid = ownGrant !== null || billingAccountGrant !== null;
    } catch (error: unknown) {
      // Fail closed: an unverifiable subscription must not unlock paid
      // features. Not cached, so the next request retries the read.
      this.logger.warn('Organization paid access: subscription read failed', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return false;
    }

    this.paidGrantCache.set(organizationId, {
      expiresAt: now + PAID_GRANT_CACHE_TTL_MS,
      isPaid,
    });
    return isPaid;
  }

  /**
   * The grant carried by `organizationId`'s linked billing account, if any:
   * its own non-deleted subscription rows and its own `planTier`, decided
   * through the same {@link resolveOrganizationPaidGrant} the organization's
   * own read uses. `null` when no billing account is linked — that is the
   * common case for most organizations, not a failure. Any other lookup
   * failure (an ambiguous multiple-link conflict, a missing organization
   * row) propagates to `hasPaidSubscription`'s catch so the whole read fails
   * closed, same as an organization's own subscription read failing.
   */
  private async resolveBillingAccountGrant(
    organizationId: string,
    now: Date,
  ): Promise<PaidSubscriptionGrant | null> {
    const resolved = await this.resolveBillingAccountScope(organizationId);
    if (!resolved) {
      return null;
    }
    const { account, scope } = resolved;

    const subscriptions = await this.prisma.subscription.findMany({
      select: SUBSCRIPTION_SELECT,
      take: SUBSCRIPTION_READ_LIMIT,
      where: billingAccountScopedWhere(scope, {}),
    });

    return resolveOrganizationPaidGrant(subscriptions, account.planTier, now);
  }

  private async resolveBillingAccountScope(
    organizationId: string,
  ): Promise<ResolvedBillingAccountScope | null> {
    try {
      const account = await resolveLiveBillingAccount(
        organizationId,
        this.prisma,
      );
      // Guard-visible proof (#5217) that this organization may read this
      // billing account's shared rows, independent of `resolveLiveBillingAccount`
      // resolving the same account above — mirrors
      // `BillingAccountsService.getSnapshot`.
      const scope = await resolveBillingAccountAccess(
        organizationId,
        this.prisma,
      );
      return { account, scope };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }
}
