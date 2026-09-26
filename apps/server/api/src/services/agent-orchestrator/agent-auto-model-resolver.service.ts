import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentAutoRoutingResolveParams } from '@api/services/agent-orchestrator/interfaces/agent-auto-routing.interface';
import { resolveAgentAutoRoutingDecisionConfig } from '@api/services/agent-orchestrator/utils/agent-auto-routing-decision-config.util';
import { RouterPriority } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Release-blocker follow-up to #4865 (epic #4863): the hosted typed-decision
 * provider (Jev) no longer has any say in agent auto-model routing. The
 * `simple | standard | complex` classification it used to answer is gone —
 * routing is a deterministic read of the Admin-configured model registry,
 * the same "Admin TEXT default" resolution #5167 already uses for every
 * other chat-model surface. Jev keeps deciding the untrusted-content gate
 * (`agent-untrusted-content-gate.service.ts`) and reply-bot intent
 * (`reply-intent-classifier.service.ts`) — neither is touched here.
 */
export const AGENT_AUTO_ROUTING_DECISION_POINT = 'agent.auto_routing_candidate';

@Injectable()
export class AgentAutoModelResolverService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Decide the dispatch key for one round.
   *
   * Every failure mode resolves to a resolution with no `dispatchModelKey`,
   * which is the caller's instruction to emit today's request: the gateway
   * auto-router plugin. Nothing here may throw — a routing decision must
   * never be the reason an agent turn fails.
   */
  async resolve(
    params: AgentAutoRoutingResolveParams,
  ): Promise<AgentAutoRoutingResolution> {
    const { mode } = resolveAgentAutoRoutingDecisionConfig(this.configService);

    // The candidate only ever replaces the gateway auto-router; an explicitly
    // chosen model is the user's decision.
    const isTierEligible =
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO;

    if (mode === 'off' || !isTierEligible) {
      return { mode };
    }

    try {
      return await this.decide({ mode, params });
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} auto-routing resolution failed; keeping the gateway auto-router`,
        {
          error: error instanceof Error ? error.message : String(error),
          threadId: params.threadId,
        },
      );
      return { mode };
    }
  }

  private async decide(input: {
    mode: 'live' | 'shadow';
    params: AgentAutoRoutingResolveParams;
  }): Promise<AgentAutoRoutingResolution> {
    const { mode, params } = input;

    const candidateModelKey = await this.resolveDeterministicCandidate(
      params.prioritize,
    );
    const dispatchModelKey =
      mode === 'live'
        ? await this.guardAllowedKey(candidateModelKey, params.threadId)
        : undefined;

    if (mode === 'shadow') {
      this.logShadowOutcome({ candidateModelKey, params });
    }

    return {
      candidateModelKey,
      ...(dispatchModelKey === undefined ? {} : { dispatchModelKey }),
      mode,
    };
  }

  /**
   * Deterministic candidate: the Admin-configured TEXT default
   * (`getDefaultModelKey`), unless the turn asked to optimise for cost or
   * speed, in which case the cheapest selectable row wins. Both reads are
   * the existing Admin/model-registry resolution — no new settings, no
   * per-message classification.
   */
  private async resolveDeterministicCandidate(
    prioritize?: RouterPriority,
  ): Promise<string> {
    return prioritize === RouterPriority.COST ||
      prioritize === RouterPriority.SPEED
      ? this.agentChatModelRegistry.getCheapestSelectableKey()
      : this.agentChatModelRegistry.getDefaultModelKey();
  }

  /**
   * The registry cache can roll over while the decision is in flight, and a
   * discovered row can lose its approval mid-turn. Re-read the allow-list at
   * dispatch time and fall back rather than send a key the gateway's own
   * `allowed_models` list would no longer contain.
   */
  private async guardAllowedKey(
    modelKey: string,
    threadId: string,
  ): Promise<string | undefined> {
    const allowedKeys =
      await this.agentChatModelRegistry.getAutoAllowedModelKeys();
    if (allowedKeys.includes(modelKey)) {
      return modelKey;
    }

    this.loggerService.warn(
      `${this.constructorName} chosen model left the auto allow-list; keeping the gateway auto-router`,
      { modelKey, threadId },
    );
    return undefined;
  }

  private logShadowOutcome(input: {
    candidateModelKey: string;
    params: AgentAutoRoutingResolveParams;
  }): void {
    this.loggerService.log(
      `${this.constructorName} shadow auto-routing decision`,
      {
        candidateModelKey: input.candidateModelKey,
        decisionPoint: AGENT_AUTO_ROUTING_DECISION_POINT,
        roundNumber: input.params.roundNumber,
        threadId: input.params.threadId,
      },
    );
  }
}
