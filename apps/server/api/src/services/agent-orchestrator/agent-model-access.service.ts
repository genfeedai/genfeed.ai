import { resolveOrganizationPaidGrant } from '@api/common/subscriptions/paid-subscription-access.util';
import { ByokService } from '@api/services/byok/byok.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { ByokProvider } from '@genfeedai/contracts';
import {
  getAgentChatModel,
  LLM_DEFAULTS,
} from '@genfeedai/contracts/constants';
import type { IAgentModelAccess } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PAID_GRANT_CACHE_TTL_MS = 30_000;
const SUBSCRIPTION_READ_LIMIT = 20;

const UNLOCKED: IAgentModelAccess = {
  isLocked: false,
  lockedModelKey: null,
  lockedModelLabel: null,
  reason: null,
};

/**
 * Free-tier agent model lock.
 *
 * A hosted organization without an active paid subscription runs every agent
 * turn — chat, spawned sub-agents, plan mode, UI actions, recurring drafts —
 * on {@link LLM_DEFAULTS.agentChat}, whatever a strategy, org override,
 * catalog default, or request asked for. Deployments without organization
 * billing (community self-host, desktop) never lock. A turn whose model the
 * organization's own BYOK key pays for is never locked either.
 */
@Injectable()
export class AgentModelAccessService {
  private readonly context = { service: AgentModelAccessService.name };
  private readonly paidGrantCache = new Map<
    string,
    { expiresAt: number; isPaid: boolean }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly byokService: ByokService,
    private readonly logger: LoggerService,
  ) {}

  /** Entitlement for pickers and GET /agent/credits. */
  async resolveAccess(organizationId: string): Promise<IAgentModelAccess> {
    if (!(await this.isSubscriptionLocked(organizationId))) {
      return UNLOCKED;
    }
    const lockedModelKey = LLM_DEFAULTS.agentChat;
    return {
      isLocked: true,
      lockedModelKey,
      lockedModelLabel: getAgentChatModel(lockedModelKey)?.label ?? null,
      reason: 'free_tier',
    };
  }

  /**
   * The model a turn may actually run on. Returns `model` untouched for
   * subscribers, no-billing deployments, and BYOK-covered routes.
   */
  async enforceModel(organizationId: string, model: string): Promise<string> {
    if (model === LLM_DEFAULTS.agentChat) {
      return model;
    }
    if (!(await this.isSubscriptionLocked(organizationId))) {
      return model;
    }
    if (await this.isRoutePaidByByok(organizationId, model)) {
      return model;
    }
    return LLM_DEFAULTS.agentChat;
  }

  private async isSubscriptionLocked(organizationId: string): Promise<boolean> {
    if (!hasOrganizationBilling()) {
      return false;
    }
    return !(await this.hasPaidSubscription(organizationId));
  }

  private async hasPaidSubscription(organizationId: string): Promise<boolean> {
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
      // Fail closed onto the cheap model: an unverifiable subscription must
      // not unlock frontier pricing on free credits.
      this.logger.warn('Agent model access: subscription read failed', {
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

  /** Mirrors the dispatcher's route: native key, else the OpenRouter key. */
  private async isRoutePaidByByok(
    organizationId: string,
    model: string,
  ): Promise<boolean> {
    if (model.startsWith('local/')) {
      return false;
    }
    const nativeProvider = model.startsWith('anthropic/')
      ? ByokProvider.ANTHROPIC
      : model.startsWith('openai/')
        ? ByokProvider.OPENAI
        : null;
    if (
      nativeProvider &&
      (await this.byokService.isByokActiveForProvider(
        organizationId,
        nativeProvider,
      ))
    ) {
      return true;
    }
    return this.byokService.isByokActiveForProvider(
      organizationId,
      ByokProvider.OPENROUTER,
    );
  }
}
