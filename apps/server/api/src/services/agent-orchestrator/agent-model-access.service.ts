import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import {
  getAgentChatModel,
  LLM_DEFAULTS,
} from '@genfeedai/contracts/constants';
import type { IAgentModelAccess } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

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
 * billing (community self-host, desktop) never lock. BYOK keys never lift the
 * lock: BYOK itself requires a paid subscription on billed deployments.
 */
@Injectable()
export class AgentModelAccessService {
  constructor(
    private readonly organizationPaidAccessService: OrganizationPaidAccessService,
  ) {}

  /** Entitlement for pickers and GET /agent/credits. */
  async resolveAccess(organizationId: string): Promise<IAgentModelAccess> {
    if (
      !(await this.organizationPaidAccessService.isSubscriptionGated(
        organizationId,
      ))
    ) {
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
   * subscribers and no-billing deployments.
   */
  async enforceModel(organizationId: string, model: string): Promise<string> {
    if (model === LLM_DEFAULTS.agentChat) {
      return model;
    }
    if (
      !(await this.organizationPaidAccessService.isSubscriptionGated(
        organizationId,
      ))
    ) {
      return model;
    }
    return LLM_DEFAULTS.agentChat;
  }
}
