import type { AgentAutoModelResolverService } from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { RouterPriority } from '@genfeedai/contracts';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';

type AutoRoutingResolverClient = Pick<AgentAutoModelResolverService, 'resolve'>;
type ModelRegistryClient = Pick<
  AgentChatModelRegistryService,
  'getDefaultModelKey'
>;

/** What one round needs from the auto-routing decision (#4865). */
export interface AgentAutoRoutingRound {
  /** Platform default key — read once here and reused by the whole round. */
  defaultModelKey: string;
  /**
   * Key the round settles on. The reservation envelope still comes from the
   * requested key; this is what was actually dispatched.
   */
  dispatchedModel: string;
  /** Carried across rounds so terminal rounds keep the thread metadata. */
  resolution?: AgentAutoRoutingResolution;
}

/**
 * Resolve the auto-routing decision for one orchestrator round (#4865).
 *
 * A terminal round replays content a tool already produced: it never reaches
 * the provider, so it must not pay for a decision and keeps `previous`
 * instead. Every other failure mode is the resolver's own — it never throws.
 */
export async function resolveAgentAutoRoutingRound(params: {
  context: AgentChatContext;
  hasPreviousRoundUsedTools: boolean;
  hasToolsAvailable: boolean;
  isTerminalRound: boolean;
  latestUserMessage: string;
  /** The model the turn requested, before any routing decision. */
  model: string;
  modelRegistry: ModelRegistryClient;
  /** The previous round's resolution, if the turn has already made one. */
  previous?: AgentAutoRoutingResolution;
  prioritize?: RouterPriority;
  resolver: AutoRoutingResolverClient;
  /** 1-based tool-calling round inside the turn. */
  roundNumber: number;
  source?: AgentChatRequest['source'];
  threadId: string;
}): Promise<AgentAutoRoutingRound> {
  const defaultModelKey = await params.modelRegistry.getDefaultModelKey();
  const resolution = params.isTerminalRound
    ? params.previous
    : await params.resolver.resolve({
        brandId: params.context.scope?.brandId,
        defaultModelKey,
        hasPreviousRoundUsedTools: params.hasPreviousRoundUsedTools,
        hasToolsAvailable: params.hasToolsAvailable,
        latestUserMessage: params.latestUserMessage,
        model: params.model,
        organizationId: params.context.organizationId,
        prioritize: params.prioritize,
        roundNumber: params.roundNumber,
        runId: params.context.executionId,
        source: params.source,
        threadId: params.threadId,
        userId: params.context.userId,
      });

  return {
    defaultModelKey,
    dispatchedModel: resolution?.dispatchModelKey ?? params.model,
    resolution,
  };
}
