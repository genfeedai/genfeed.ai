import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import {
  buildAgentRoutingMetadata,
  resolveAgentRoutingPlugins,
  resolveAgentRoutingPolicy,
} from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  buildFallbackThreadTitle,
  sanitizeGeneratedThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  OpenRouterMessage,
  OpenRouterPlugin,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
import { AgentMessageRole } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

/**
 * Host callbacks for plan-mode turns that still depend on orchestrator-owned
 * thread title persistence (async DB update).
 *
 * `maybeUpdateThreadTitle` resolves to the persisted title, or null when the
 * thread had already been renamed and nothing changed. Plan-mode turns do not
 * push a live title today (their `agent:done` payload carries no `threadTitle`),
 * so the value is unused here — the shape mirrors the util so the two cannot
 * drift apart again.
 */
export type AgentOrchestratorPlanModeHost = {
  maybeUpdateThreadTitle: (params: {
    context: AgentChatContext;
    seedTitle: string;
    threadId: string;
    title: string | null;
  }) => Promise<string | null>;
};

@Injectable()
export class AgentOrchestratorPlanModeService {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
  ) {}

  async tryHandlePlanModeTurn(
    params: {
      context: AgentChatContext;
      model: string;
      request: AgentChatRequest;
      resolvedMemories: AgentMemoryDocument[];
      seedTitle: string;
      systemPromptOverride?: string;
      threadId: string;
      turnCost: number;
    },
    host: AgentOrchestratorPlanModeHost,
  ): Promise<AgentChatResult | null> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return null;
    }

    return await this.generatePlanModeResponse(
      {
        context: params.context,
        model: params.model,
        request: params.request,
        resolvedMemories: params.resolvedMemories,
        seedTitle: params.seedTitle,
        systemPromptOverride: params.systemPromptOverride,
        threadId: params.threadId,
        turnCost: params.turnCost,
      },
      host,
    );
  }

  async tryHandlePlanModeTurnStream(
    params: {
      context: AgentChatContext;
      model: string;
      request: AgentChatRequest;
      resolvedMemories: AgentMemoryDocument[];
      seedTitle: string;
      startedAt: string;
      systemPromptOverride?: string;
      threadId: string;
      turnCost: number;
    },
    host: AgentOrchestratorPlanModeHost,
  ): Promise<boolean> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return false;
    }

    const response = await this.generatePlanModeResponse(
      {
        context: params.context,
        model: params.model,
        request: params.request,
        resolvedMemories: params.resolvedMemories,
        seedTitle: params.seedTitle,
        systemPromptOverride: params.systemPromptOverride,
        threadId: params.threadId,
        turnCost: params.turnCost,
      },
      host,
    );

    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: response.message.content,
        context: params.context,
        creditsRemaining: response.creditsRemaining,
        creditsUsed: response.creditsUsed,
        metadata: response.message.metadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

    return true;
  }

  async generatePlanModeResponse(
    params: {
      context: AgentChatContext;
      model: string;
      reviewMetadata?: {
        lastReviewAction?: 'approve' | 'request_changes';
        revisionNote?: string;
      };
      request: AgentChatRequest;
      resolvedMemories: AgentMemoryDocument[];
      seedTitle: string;
      systemPromptOverride?: string;
      threadId: string;
      turnCost: number;
    },
    host: AgentOrchestratorPlanModeHost,
  ): Promise<AgentChatResult> {
    const { messages: recentMessages, compressedContext: planCompressedCtx } =
      await this.contextService.resolveThreadMessages(
        params.threadId,
        params.context.organizationId,
      );
    const history = this.contextService.buildMessageHistory(
      recentMessages,
      params.systemPromptOverride,
      params.resolvedMemories,
      params.request.attachments,
      planCompressedCtx,
    );

    const chatParams = await this.buildPlanningChatCompletionParams({
      messages: history,
      model: params.model,
      prompt: params.request.content,
      seedTitle: params.seedTitle,
      source: params.request.source,
      threadId: params.threadId,
    });
    const reservedRound = await runReservedAgentLlmRound({
      actorUserId: params.context.userId,
      credits: this.creditsUtilsService,
      estimatedCredits: (actualModel) =>
        this.agentChatModelRegistry.getRoundCredits(actualModel),
      idempotencyKey: `${params.context.executionId ?? params.threadId}:agent-plan-round:1`,
      maximumCredits: await this.agentChatModelRegistry.getMaximumRoundCredits(
        params.model,
      ),
      organizationId: params.context.organizationId,
      requestedModel: params.model,
      run: () =>
        this.llmDispatcher.chatCompletion(
          chatParams,
          params.context.organizationId,
          {
            brandId: params.context.scope?.brandId,
            runId: params.context.executionId,
            threadId: params.threadId,
            userId: params.context.userId,
          },
        ),
      waived: params.turnCost === 0,
    });
    const response = reservedRound.response;

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No planning response from LLM');
    }

    const envelope = this.extractPlanEnvelope({
      assistantContent: sanitizeAgentOutputText(choice.message.content || ''),
      prompt: params.request.content,
      seedTitle: params.seedTitle,
    });
    const plan = {
      ...envelope.plan,
      ...(params.reviewMetadata?.lastReviewAction
        ? { lastReviewAction: params.reviewMetadata.lastReviewAction }
        : {}),
      ...(params.reviewMetadata?.revisionNote
        ? { revisionNote: params.reviewMetadata.revisionNote }
        : {}),
    };

    await host.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: envelope.title,
    });

    await this.threadEventRecorder.recordPlanUpserted({
      context: params.context,
      plan,
      runId: params.context.executionId,
      threadId: params.threadId,
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...buildAgentRoutingMetadata({
        defaultModelKey: await this.agentChatModelRegistry.getDefaultModelKey(),
        model: params.model,
        prompt: params.request.content,
        source: params.request.source,
      }),
      ...buildResolvedModelMetadata(params.model, [
        response.model ?? params.model,
      ]),
      proposedPlan: plan,
      reviewRequired: true,
      riskLevel: 'low' as const,
      totalCreditsUsed: reservedRound.credits,
    };
    const content =
      envelope.summary ||
      'I drafted a plan and paused here for your approval. Review it, then approve or request changes.';

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content,
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Plan proposed and awaiting approval',
      runId: params.context.executionId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: reservedRound.credits,
      message: {
        content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  private async isPlanModeEnabledForThread(
    threadId: string,
    organizationId: string,
  ): Promise<boolean> {
    const thread = await this.agentThreadsService.findOne({
      id: threadId,
      organizationId: organizationId,
    });

    return Boolean(thread?.planModeEnabled);
  }

  private async buildPlanningChatCompletionParams(params: {
    messages: OpenRouterMessage[];
    model: string;
    prompt: string;
    seedTitle?: string;
    source?: AgentChatRequest['source'];
    threadId: string;
  }): Promise<{
    max_tokens: number;
    messages: OpenRouterMessage[];
    model: string;
    plugins?: OpenRouterPlugin[];
    session_id?: string;
    temperature: number;
  }> {
    const routingPolicy = resolveAgentRoutingPolicy({
      defaultModelKey: await this.agentChatModelRegistry.getDefaultModelKey(),
      model: params.model,
      prompt: params.prompt,
      source: params.source,
    });
    const routingPlugins = resolveAgentRoutingPlugins(routingPolicy) ?? [];
    const plugins =
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO
        ? [
            ...routingPlugins,
            {
              allowed_models:
                await this.agentChatModelRegistry.getAutoAllowedModelKeys(),
              cost_tier: 'medium' as const,
              id: 'auto-router',
            },
          ]
        : routingPlugins;
    const planInstruction = {
      content:
        'Plan mode is enabled. Do not call tools or execute work. Respond with valid JSON only: {"title":"optional thread title","summary":"one short summary sentence","explanation":"brief rationale","content":"markdown plan","steps":[{"step":"...", "status":"pending"}]}. Keep the plan concise and execution-ready.',
      role: 'system' as const,
    };

    return {
      max_tokens: 2048,
      messages: [planInstruction, ...params.messages],
      model: params.model,
      ...(plugins.length > 0 ? { plugins } : {}),
      ...(params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO
        ? { session_id: params.threadId }
        : {}),
      temperature: 0.3,
    };
  }

  private extractPlanEnvelope(params: {
    assistantContent: string;
    prompt: string;
    seedTitle: string;
  }): {
    title: string | null;
    summary: string;
    plan: {
      id: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval';
      awaitingApproval: true;
    };
  } {
    const trimmed = params.assistantContent.trim();
    const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
    let parsed: Record<string, unknown> | null = null;

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : candidate;
    const explanation =
      typeof parsed?.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : undefined;
    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : 'I drafted a plan and paused for your approval.';
    const title =
      typeof parsed?.title === 'string' && parsed.title.trim()
        ? sanitizeGeneratedThreadTitle(parsed.title.trim(), params.prompt)
        : params.seedTitle.trim()
          ? buildFallbackThreadTitle(params.prompt)
          : null;
    const steps = Array.isArray(parsed?.steps)
      ? (parsed?.steps as Record<string, unknown>[])
      : undefined;

    return {
      plan: {
        awaitingApproval: true,
        content,
        ...(explanation ? { explanation } : {}),
        id: `plan-${Date.now()}`,
        status: 'awaiting_approval',
        ...(steps ? { steps } : {}),
      },
      summary,
      title,
    };
  }
}
