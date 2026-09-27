import { resolveOrganizationPaidGrant } from '@api/common/subscriptions/paid-subscription-access.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PAID_GRANT_CACHE_TTL_MS = 30_000;
const SUBSCRIPTION_READ_LIMIT = 20;

/**
 * Cached "does this organization pay for a plan" read for per-request gates.
 * Decides through {@link resolveOrganizationPaidGrant}: an active paid
 * subscription, or a cancellation still inside its paid period. Features that
 * sit behind a subscription (BYOK, the unlocked agent model picker) ask
 * {@link isSubscriptionGated} so deployments without organization billing
 * (community self-host, desktop) are never gated.
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
          select: {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            plan: true,
            status: true,
          },
          take: SUBSCRIPTION_READ_LIMIT,
          where: { isDeleted: false, organizationId },
        }),
        this.prisma.organizationSetting.findFirst({
          select: { subscriptionTier: true },
          where: { organizationId },
        }),
      ]);
      isPaid =
        resolveOrganizationPaidGrant(
          subscriptions,
          settings?.subscriptionTier ?? null,
          new Date(now),
        ) !== null;
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
}
