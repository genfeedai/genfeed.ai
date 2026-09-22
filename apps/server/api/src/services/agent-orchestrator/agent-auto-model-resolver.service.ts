import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentAutoRoutingResolveParams } from '@api/services/agent-orchestrator/interfaces/agent-auto-routing.interface';
import { pickModelForTier } from '@api/services/agent-orchestrator/utils/agent-auto-model-tier.util';
import { resolveAgentAutoRoutingDecisionConfig } from '@api/services/agent-orchestrator/utils/agent-auto-routing-decision-config.util';
import { resolveAgentRoutingPolicy } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { AGENT_CHAT_ROUTING_TIERS } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  AgentAutoRoutingResolution,
  AgentAutoRoutingState,
  TypedDecisionAnswer,
  TypedDecisionCallContext,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Stable telemetry keys. #4874 queries shadow-mode agreement by these exact
 * strings, so they are part of the contract with the reporting tooling and
 * must not be renamed with the call sites.
 */
export const AGENT_AUTO_ROUTING_TIER_DECISION_POINT = 'agent.auto_routing_tier';
export const AGENT_WEB_SEARCH_DECISION_POINT = 'agent.web_search_needed';

const TIER_QUESTION =
  'What capability tier does this assistant turn need to be answered well?';
const WEB_SEARCH_QUESTION =
  'Does answering this turn require current information from the live web?';

/**
 * The state is data, never instructions, and it leaves the app for a hosted
 * vendor — so the user message is bounded before it is sent. A tier is decided
 * from the shape of the ask, which the opening of a message already carries.
 */
const MAX_DECISION_MESSAGE_CHARS = 2_000;

@Injectable()
export class AgentAutoModelResolverService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly typedDecisionService: TypedDecisionService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Decide the tier (and the web-search need) for one round (#4865).
   *
   * Every failure mode resolves to a resolution with neither `dispatchModelKey`
   * nor `isWebSearchNeeded` set, which is the caller's instruction to emit
   * today's request: the gateway auto-router plugin and the keyword web
   * policy. Nothing here may throw — a routing decision must never be the
   * reason an agent turn fails.
   */
  async resolve(
    params: AgentAutoRoutingResolveParams,
  ): Promise<AgentAutoRoutingResolution> {
    const { minConfidence, mode } = resolveAgentAutoRoutingDecisionConfig(
      this.configService,
    );

    if (mode === 'off') {
      return { mode };
    }

    // The tier only replaces the gateway auto-router; an explicitly chosen
    // model is the user's decision. The web plugin only ever attaches on the
    // platform default, so the boolean is only asked where it could be acted on.
    const isTierEligible =
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO;
    const isWebSearchEligible =
      params.model === params.defaultModelKey && params.source !== 'onboarding';

    if (!isTierEligible && !isWebSearchEligible) {
      return { mode };
    }

    try {
      return await this.decide({
        isTierEligible,
        isWebSearchEligible,
        minConfidence,
        mode,
        params,
      });
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
    isTierEligible: boolean;
    isWebSearchEligible: boolean;
    minConfidence: number;
    mode: 'live' | 'shadow';
    params: AgentAutoRoutingResolveParams;
  }): Promise<AgentAutoRoutingResolution> {
    const { isTierEligible, isWebSearchEligible, minConfidence, mode, params } =
      input;

    const state: AgentAutoRoutingState = {
      hasPreviousRoundUsedTools: params.hasPreviousRoundUsedTools,
      hasToolsAvailable: params.hasToolsAvailable,
      latestUserMessage: params.latestUserMessage.slice(
        0,
        MAX_DECISION_MESSAGE_CHARS,
      ),
      prioritize: params.prioritize,
      roundNumber: params.roundNumber,
    };
    const callContext: Omit<TypedDecisionCallContext, 'decisionPoint'> = {
      brandId: params.brandId,
      mode,
      organizationId: params.organizationId,
      runId: params.runId,
      threadId: params.threadId,
      userId: params.userId,
    };
    // The regex outcome is both the fallback and the comparison baseline the
    // shadow report needs, so it is computed even when the provider answers.
    const isWebSearchEnabledByKeywords =
      resolveAgentRoutingPolicy({
        defaultModelKey: params.defaultModelKey,
        model: params.model,
        prompt: params.latestUserMessage,
        source: params.source,
      }).reason !== 'default';

    const [tierAnswer, webSearchAnswer] = await Promise.all([
      isTierEligible
        ? this.typedDecisionService.choose(
            {
              options: AGENT_CHAT_ROUTING_TIERS,
              question: TIER_QUESTION,
              state: { ...state },
            },
            {
              ...callContext,
              decisionPoint: AGENT_AUTO_ROUTING_TIER_DECISION_POINT,
            },
          )
        : null,
      isWebSearchEligible
        ? this.typedDecisionService.decide(
            { question: WEB_SEARCH_QUESTION, state: { ...state } },
            {
              ...callContext,
              decisionPoint: AGENT_WEB_SEARCH_DECISION_POINT,
              deterministicAnswer: isWebSearchEnabledByKeywords,
            },
          )
        : null,
    ]);

    const candidateModelKey = tierAnswer
      ? pickModelForTier(
          await this.agentChatModelRegistry.listAutoCandidates(),
          tierAnswer.value,
          params.prioritize,
        )
      : undefined;
    const dispatchModelKey =
      mode === 'live' &&
      candidateModelKey !== undefined &&
      this.isConfident(tierAnswer, minConfidence)
        ? await this.guardAllowedKey(candidateModelKey, params.threadId)
        : undefined;
    const isWebSearchNeeded =
      mode === 'live' && this.isConfident(webSearchAnswer, minConfidence)
        ? webSearchAnswer?.value
        : undefined;

    if (mode === 'shadow') {
      this.logShadowOutcome({
        candidateModelKey,
        isWebSearchEnabledByKeywords,
        params,
        tierAnswer,
        webSearchAnswer,
      });
    }

    return {
      ...(candidateModelKey === undefined ? {} : { candidateModelKey }),
      ...(dispatchModelKey === undefined ? {} : { dispatchModelKey }),
      ...(isWebSearchNeeded === undefined ? {} : { isWebSearchNeeded }),
      mode,
      ...(tierAnswer === null
        ? {}
        : { tier: tierAnswer.value, tierConfidence: tierAnswer.confidence }),
    };
  }

  private isConfident<TValue>(
    answer: TypedDecisionAnswer<TValue> | null,
    minConfidence: number,
  ): boolean {
    return answer !== null && answer.confidence >= minConfidence;
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
    candidateModelKey?: string;
    isWebSearchEnabledByKeywords: boolean;
    params: AgentAutoRoutingResolveParams;
    tierAnswer: TypedDecisionAnswer<string> | null;
    webSearchAnswer: TypedDecisionAnswer<boolean> | null;
  }): void {
    this.loggerService.log(
      `${this.constructorName} shadow auto-routing decision`,
      {
        candidateModelKey: input.candidateModelKey,
        isWebSearchEnabledByKeywords: input.isWebSearchEnabledByKeywords,
        roundNumber: input.params.roundNumber,
        threadId: input.params.threadId,
        tier: input.tierAnswer?.value,
        tierConfidence: input.tierAnswer?.confidence,
        webSearchConfidence: input.webSearchAnswer?.confidence,
        webSearchNeeded: input.webSearchAnswer?.value,
      },
    );
  }
}
