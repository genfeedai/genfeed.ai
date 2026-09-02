import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { captureRunArtifacts } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { extractBatchTopic } from '@api/services/agent-orchestrator/utils/agent-orchestrator-input-parsing.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import { buildFallbackThreadTitle } from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import { AgentMessageRole } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

interface BatchGenerationDraft {
  brandId?: string;
  count: number;
  dateRange: {
    end: string;
    start: string;
  };
  handle?: string;
  platforms: string[];
  topics?: string[];
}

/**
 * Host callbacks for batch generation that still depend on orchestrator-owned
 * thread title helpers.
 *
 * `maybeUpdateThreadTitle` resolves to the persisted title, or null when the
 * thread had already been renamed and nothing changed. Batch turns do not push
 * a live title today (their `agent:done` payload carries no `threadTitle`), so
 * the value is unused here — the shape mirrors the util so the two cannot drift
 * apart again.
 */
export type AgentOrchestratorBatchHost = {
  maybeUpdateThreadTitle: (params: {
    context: AgentChatContext;
    seedTitle: string;
    threadId: string;
    title: string | null;
  }) => Promise<string | null>;
};

@Injectable()
export class AgentOrchestratorBatchService {
  constructor(
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly streamEffects: AgentStreamEffectsService,
  ) {}

  async tryHandleBatchGenerationTurnStream(
    params: {
      context: AgentChatContext;
      model: string;
      policy: ResolvedAgentExecutionPolicy;
      requestContent: string;
      seedTitle: string;
      startedAt: string;
      threadId: string;
    },
    host: AgentOrchestratorBatchHost,
  ): Promise<boolean> {
    const draft = this.extractBatchGenerationDraftFromMessage(
      params.requestContent,
      params.policy.brandId,
    );

    if (!draft) {
      return false;
    }

    const toolName = AgentToolName.GENERATE_CONTENT_BATCH;
    const toolCallId = `${params.context.executionId ?? params.threadId}:batch`;
    const toolParams: Record<string, unknown> = {
      count: draft.count,
      dateRange: draft.dateRange,
      platforms: draft.platforms,
      ...(draft.brandId ? { brandId: draft.brandId } : {}),
      ...(draft.handle ? { handle: draft.handle } : {}),
      ...(draft.topics?.length ? { topics: draft.topics } : {}),
    };
    const startedAtIso = new Date().toISOString();
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolParams,
      runId: params.context.executionId,
      threadId: params.threadId,
      toolName,
    });
    await runEffectPromise(
      this.streamEffects.publishStreamingToolStartedEffect({
        context: params.context,
        detail: `Starting ${toolName}`,
        label: toolName,
        parameters: toolParams,
        progress: 10,
        startedAt: startedAtIso,
        threadId: params.threadId,
        toolCallId,
        toolName,
        workEventDetail: `Creating ${draft.count} post${draft.count === 1 ? '' : 's'} and streaming drafts as they finish.`,
        workEventLabel: 'Batch generation',
      }),
    );
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolParams,
      {
        apiKeyContext: params.context.apiKeyContext,
        autonomyMode: params.policy.autonomyMode,
        brandId: params.policy.brandId,
        creditGovernance: params.policy.creditGovernance,
        generationModelOverride: params.policy.generationModelOverride,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        platform: params.policy.platform,
        qualityTier: params.policy.qualityTier,
        reviewModelOverride: params.policy.reviewModelOverride,
        runId: params.context.executionId,
        strategyId: params.context.strategyId,
        streamBatchToUser: true,
        thinkingModel: params.policy.thinkingModelOverride ?? undefined,
        threadId: params.threadId,
        userId: params.context.userId,
        validatedScope: params.policy.scope,
      },
    );

    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      parameters: toolParams,
      resultSummary:
        typeof result.data?.message === 'string'
          ? result.data.message
          : undefined,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.threadEventRecorder.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.executionId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });
    await runEffectPromise(
      this.streamEffects.publishStreamingToolCompletedEffect({
        context: params.context,
        creditsUsed: summary.creditsUsed,
        detail: summary.error ?? summary.resultSummary,
        durationMs,
        error: summary.error,
        label: toolName,
        parameters: toolParams,
        resultSummary: summary.resultSummary,
        status: summary.status,
        threadId: params.threadId,
        toolCallId,
        toolName,
      }),
    );

    if (!result.success) {
      await runEffectPromise(
        this.streamEffects.publishStreamErrorOnlyEffect(
          params.context,
          params.threadId,
          result.error ?? 'Batch generation failed',
        ),
      );
      return true;
    }

    const fullContent =
      typeof result.data?.streamedTranscript === 'string'
        ? result.data.streamedTranscript
        : typeof result.data?.message === 'string'
          ? result.data.message
          : 'Batch generation completed.';
    await host.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: buildFallbackThreadTitle(params.requestContent),
    });
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: result.requiresConfirmation ?? false,
        toolCalls: [{ status: summary.status, toolName }],
        uiActions: result.nextActions ?? [],
      });
    const artifactMetadata = captureRunArtifacts(params.context, result.data);
    const assistantMetadata = {
      ...artifactMetadata,
      ...buildAgentScopeMetadata(params.context),
      creditsRemaining,
      ...buildResolvedModelMetadata(params.model),
      reviewRequired: result.requiresConfirmation ?? false,
      riskLevel: result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: fullContent,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: [
        {
          creditsUsed: summary.creditsUsed,
          durationMs: summary.durationMs,
          error: summary.error,
          parameters: summary.parameters ?? {},
          result: summary.resultSummary
            ? { summary: summary.resultSummary }
            : {},
          status: summary.status,
          toolName,
        },
      ],
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content: fullContent,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: fullContent,
        context: params.context,
        creditsRemaining,
        creditsUsed: result.creditsUsed ?? 0,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [summary],
      }),
    );

    return true;
  }

  isBatchGenerationIntent(content: string): boolean {
    const normalized = content.toLowerCase();

    return (
      /\b(generate|create|make|write|draft)\b/.test(normalized) &&
      /\b\d+\s+(posts?|tweets?|drafts?)\b/.test(normalized)
    );
  }

  private extractBatchGenerationDraftFromMessage(
    content: string,
    fallbackBrandId?: string | null,
  ): BatchGenerationDraft | null {
    if (!this.isBatchGenerationIntent(content)) {
      return null;
    }

    const normalized = content.toLowerCase();
    const countMatch = normalized.match(/\b(\d+)\s+(posts?|tweets?|drafts?)\b/);
    const count = Number.parseInt(countMatch?.[1] ?? '', 10);

    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }

    const handle = content.match(/@\w[\w.]{1,}/)?.[0];

    if (!handle && !fallbackBrandId) {
      return null;
    }

    const topics = this.extractBatchTopics(content, normalized);

    return {
      brandId: fallbackBrandId ?? undefined,
      count,
      dateRange: this.resolveBatchDateRange(normalized),
      handle,
      platforms: this.extractBatchPlatforms(normalized, countMatch?.[2]),
      ...(topics.length > 0 ? { topics } : {}),
    };
  }

  private extractBatchPlatforms(
    normalizedContent: string,
    noun?: string,
  ): string[] {
    if (
      noun?.startsWith('tweet') ||
      /\b(?:for|on)\s+(?:x|twitter)\b/.test(normalizedContent)
    ) {
      return ['twitter'];
    }

    if (/\b(?:for|on)\s+linkedin\b/.test(normalizedContent)) {
      return ['linkedin'];
    }

    if (/\b(?:for|on)\s+instagram\b/.test(normalizedContent)) {
      return ['instagram'];
    }

    return ['twitter'];
  }

  private extractBatchTopics(
    originalContent: string,
    normalizedContent: string,
  ): string[] {
    const topic = extractBatchTopic(originalContent, normalizedContent);

    return topic ? [topic] : [];
  }

  private resolveBatchDateRange(normalizedContent: string): {
    end: string;
    start: string;
  } {
    const start = new Date();
    const end = new Date(start);

    if (/\bthis month\b/.test(normalizedContent)) {
      end.setDate(end.getDate() + 30);
    } else if (/\bnext month\b/.test(normalizedContent)) {
      start.setMonth(start.getMonth() + 1, 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
    } else if (/\bnext week\b/.test(normalizedContent)) {
      start.setDate(start.getDate() + 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      end.setDate(end.getDate() + 7);
    }

    return {
      end: end.toISOString(),
      start: start.toISOString(),
    };
  }
}
