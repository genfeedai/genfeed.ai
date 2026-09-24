import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSaaS } from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import {
  type ResearchAccessDecision,
  resolveResearchCollectionAccess,
} from './research-paid-access';

/**
 * Loads the organization subscription from Postgres. Session flags, API keys,
 * and BYOK settings are intentionally not inputs.
 */
@Injectable()
export class ResearchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async decide(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ResearchAccessDecision> {
    if (!isSaaS()) {
      return resolveResearchCollectionAccess({
        isHostedSaas: false,
        now,
        subscriptionReadFailed: false,
        subscriptionTier: null,
        subscriptions: [],
      });
    }
    if (!organizationId) {
      return {
        isAllowed: false,
        reason: 'research_paid_access_required',
      };
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
      return resolveResearchCollectionAccess({
        isHostedSaas: true,
        now,
        subscriptionReadFailed: false,
        subscriptionTier: settings?.subscriptionTier ?? null,
        subscriptions,
      });
    } catch {
      return {
        isAllowed: false,
        reason: 'research_subscription_unverified',
      };
    }
  }
}
