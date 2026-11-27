import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSaaS } from '@genfeedai/config';
import { SubscriptionTier } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import {
  type ResearchAccessDecision,
  resolveResearchCollectionAccess,
  resolveResearchScanTier,
} from './research-paid-access';
import { getResearchScanGrant } from './research-scan.context';

export interface ResearchPlanResolution {
  /** The plan decision, before any scan reservation is taken into account. */
  decision: ResearchAccessDecision;
  /** The tier whose scan limit applies. Free when the organization has no plan. */
  tier: SubscriptionTier;
}

/**
 * Loads the organization subscription from Postgres. Session flags, API keys,
 * and BYOK settings are intentionally not inputs.
 */
@Traced()
@Injectable()
export class ResearchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether hosted collection may run for the organization now. A plan allows
   * it. Without a plan it is allowed only inside a scan the organization
   * reserved (see `ResearchScanService`): the scan limit, not the plan,
   * admits that collection.
   */
  async decide(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ResearchAccessDecision> {
    const { decision } = await this.resolve(organizationId, now);
    if (
      !decision.isAllowed &&
      decision.reason === 'research_paid_access_required' &&
      getResearchScanGrant(organizationId)
    ) {
      return { isAllowed: true, reason: 'scan_reserved' };
    }
    return decision;
  }

  /** The plan decision and the tier it implies, read from Postgres. */
  async resolve(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ResearchPlanResolution> {
    if (!isSaaS()) {
      // Self-hosted installs have no plan and no scan limit.
      return {
        decision: resolveResearchCollectionAccess({
          isHostedSaas: false,
          now,
          subscriptionReadFailed: false,
          subscriptionTier: null,
          subscriptions: [],
        }),
        tier: SubscriptionTier.ENTERPRISE,
      };
    }
    if (!organizationId) {
      return this.unresolved('research_paid_access_required');
    }
    try {
      const [subscriptions, settings] = await Promise.all([
        this.prisma.subscription.findMany({
          select: {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            plan: true,
            status: true,
          },
          take: 20,
          where: { isDeleted: false, organizationId },
        }),
        this.prisma.organizationSetting.findFirst({
          select: { subscriptionTier: true },
          where: { organizationId },
        }),
      ]);
      const subscriptionTier = settings?.subscriptionTier ?? null;
      const decision = resolveResearchCollectionAccess({
        isHostedSaas: true,
        now,
        subscriptionReadFailed: false,
        subscriptionTier,
        subscriptions,
      });
      return {
        decision,
        tier: resolveResearchScanTier(decision, subscriptionTier),
      };
    } catch {
      return this.unresolved('research_subscription_unverified');
    }
  }

  private unresolved(
    reason:
      | 'research_paid_access_required'
      | 'research_subscription_unverified',
  ): ResearchPlanResolution {
    const decision = { isAllowed: false, reason } as const;
    return { decision, tier: resolveResearchScanTier(decision, null) };
  }
}
