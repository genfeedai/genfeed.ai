import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import type {
  FinalizeStructuredAssistantTurnParams,
  LatestUiBlocks,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { captureRunArtifacts } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import { normalizeUiBlocks } from '@api/services/agent-orchestrator/utils/agent-ui-blocks.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { AgentMessageRole } from '@genfeedai/enums';
import { type AgentDashboardOperation } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentOrchestratorUiActionFinalizerService {
  constructor(
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
  ) {}

  async finalizeStructuredAssistantTurn(
    params: FinalizeStructuredAssistantTurnParams,
  ): Promise<AgentChatResult> {
    const latestUiBlocks = await this.recordUiBlocks(params);
    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: params.result.requiresConfirmation ?? false,
        toolCalls: params.toolCalls,
        uiActions: params.result.nextActions ?? [],
      });
    const normalizedContent = normalizeFinalAssistantContent(
      sanitizeAgentOutputText(params.content),
      params.toolCalls,
      enhancedUiActions.uiActions,
    );
    const artifactMetadata = captureRunArtifacts(
      params.context,
      params.result.data,
    );
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...artifactMetadata,
      ...buildAgentScopeMetadata(params.context),
      isFallbackContent: normalizedContent.isFallback,
      ...buildResolvedModelMetadata(params.model),
      reviewRequired: params.result.requiresConfirmation ?? false,
      riskLevel: params.result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: params.result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
      ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
      ...(params.metadata ?? {}),
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: normalizedContent.content,
      metadata: { creditsRemaining, ...assistantMetadata },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: params.toolCalls.map((toolCall) => ({
        creditsUsed: toolCall.creditsUsed,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
        parameters: toolCall.parameters ?? {},
        result: toolCall.resultSummary
          ? { summary: toolCall.resultSummary }
          : {},
        status: toolCall.status,
        toolName: toolCall.toolName,
      })),
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content: normalizedContent.content,
      context: params.context,
      idempotencyKey: params.eventIdempotencyKey,
      metadata: assistantMetadata,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      idempotencyKey: params.eventIdempotencyKey,
      runId: params.context.executionId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: params.result.creditsUsed ?? 0,
      message: {
        content: normalizedContent.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: params.toolCalls,
    };
  }

  private async recordUiBlocks(
    params: FinalizeStructuredAssistantTurnParams,
  ): Promise<LatestUiBlocks | null> {
    const rawUiBlocks = Array.isArray(params.result.data?.uiBlocks)
      ? params.result.data.uiBlocks
      : null;
    const rawOperation =
      typeof params.result.data?.operation === 'string'
        ? (params.result.data.operation as AgentDashboardOperation)
        : null;
    if (!rawUiBlocks || !rawOperation) {
      return null;
    }

    const normalizedBlocks = normalizeUiBlocks(rawUiBlocks);
    const latestUiBlocks = {
      blockIds: Array.isArray(params.result.data?.blockIds)
        ? (params.result.data.blockIds as string[])
        : undefined,
      blocks: normalizedBlocks,
      operation: rawOperation,
    };
    await this.threadEventRecorder.recordUiBlocksUpdated({
      blockIds: latestUiBlocks.blockIds,
      blocks: normalizedBlocks,
      context: params.context,
      operation: rawOperation,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    return latestUiBlocks;
  }
}
