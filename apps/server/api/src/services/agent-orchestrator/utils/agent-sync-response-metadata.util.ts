import type { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import type { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import type { AgentToolRoundState } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { mergeAgentArtifactCompletionMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';

export interface AgentSyncResponseMetadataParams {
  actualModels: string[];
  approvedPlan?: Record<string, unknown>;
  autoRouting?: AgentAutoRoutingResolution;
  context: AgentChatContext;
  defaultModelKey: string;
  enhancedUiActions: ReturnType<
    AgentCompletionCardBuilderService['buildAssistantUiActions']
  >;
  isFallbackContent: boolean;
  memoryEntries: ReturnType<
    AgentOrchestratorContextService['buildMemoryEntriesForResponse']
  >;
  memoryInfluence: ReturnType<
    AgentOrchestratorContextService['buildMemoryInfluenceMetadata']
  >;
  model: string;
  reasoning: string | null;
  request: Pick<AgentChatRequest, 'content' | 'source'>;
  toolRoundState: AgentToolRoundState;
}

/** One response payload for persistence, thread projection and live delivery. */
export function buildAgentSyncResponseMetadata(
  params: AgentSyncResponseMetadataParams,
): Record<string, unknown> {
  const { enhancedUiActions, toolRoundState } = params;
  return {
    ...mergeAgentArtifactCompletionMetadata(toolRoundState.artifactMetadata),
    ...(params.approvedPlan ? { proposedPlan: params.approvedPlan } : {}),
    ...buildAgentScopeMetadata(params.context),
    ...buildAgentRoutingMetadata({
      autoRouting: params.autoRouting,
      defaultModelKey: params.defaultModelKey,
      model: params.model,
      prompt: params.request.content,
      source: params.request.source,
    }),
    ...buildResolvedModelMetadata(params.model, params.actualModels),
    isFallbackContent: params.isFallbackContent,
    memoryEntries: params.memoryEntries,
    memoryInfluence: params.memoryInfluence,
    reasoning: params.reasoning,
    reviewRequired: toolRoundState.reviewRequired,
    riskLevel: toolRoundState.highestRiskLevel,
    ...(enhancedUiActions.suggestedActions.length
      ? { suggestedActions: enhancedUiActions.suggestedActions }
      : {}),
    totalCreditsUsed: toolRoundState.totalCreditsUsed,
    uiActions: enhancedUiActions.uiActions,
    ...(toolRoundState.latestUiBlocks
      ? { uiBlocks: toolRoundState.latestUiBlocks }
      : {}),
  };
}
