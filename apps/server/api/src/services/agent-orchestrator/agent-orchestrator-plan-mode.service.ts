import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { canThreadSourceReviewPlans } from '@api/collections/agent-threads/utils/agent-thread-mode-for-source.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentAutoModelResolverService } from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type {
  PlanModeQuestion,
  PlanModeResponseParams,
} from '@api/services/agent-orchestrator/interfaces/agent-orchestrator-plan-mode.interface';
import type { AgentPlanReviewMetadata } from '@api/services/agent-orchestrator/interfaces/agent-plan-review-metadata.interface';
import {
  type AgentAutoRoutingRound,
  resolveAgentAutoRoutingRound,
} from '@api/services/agent-orchestrator/utils/agent-auto-routing-round.util';
import {
  formatBriefLabels,
  IMAGE_BRIEF_CHECKLIST,
  POST_BRIEF_CHECKLIST,
  VIDEO_BRIEF_CHECKLIST,
} from '@api/services/agent-orchestrator/utils/agent-generation-brief.util';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { buildPersistedAgentResponseMetadata } from '@api/services/agent-orchestrator/utils/agent-persisted-response-metadata.util';
import {
  countTrailingPlanQuestions,
  MAX_PLAN_QUESTION_ROUNDS,
  PLAN_QUESTION_METADATA_KEY,
  parsePlanQuestion,
  parsePlanResponse,
} from '@api/services/agent-orchestrator/utils/agent-plan-question.util';
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
import { AgentMessageRole, AgentThreadMode } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';
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

const PLAN_MODE_INSTRUCTION =
  'Plan mode is enabled. Do not call tools or execute work. Respond with valid JSON only: {"title":"optional thread title","summary":"one short summary sentence","explanation":"brief rationale","content":"markdown plan","steps":[{"step":"...", "status":"pending"}]}. Keep the plan concise and execution-ready. Plan motion graphics, animated logos or titles, kinetic typography and visual-code or Remotion requests as a coded visual project (quote_visual_code_generation, then generate_visual_code after approval), never as a provider video model.';

/**
 * Plan mode runs one round with no tools, so the planner asks through the same
 * input-request card as `request_input` by answering with a `question` instead
 * of a plan. The answer arrives as the next turn and the planner runs again.
 */
const PLAN_MODE_QUESTION_INSTRUCTION = `If the request leaves out something that would change the plan, ask one question instead of planning. Respond with valid JSON only: {"title":"optional thread title","question":{"title":"short card title","prompt":"the question","options":[{"id":"short-id","label":"Choice","description":"optional"}],"recommendedOptionId":"optional option id","allowFreeText":true}}. Offer two to five options and ask one question per turn. Ask only for what you cannot infer from the request, the brand context or earlier answers. For a video check the ${formatBriefLabels(VIDEO_BRIEF_CHECKLIST.map((field) => field.label))}. For an image check the ${formatBriefLabels(IMAGE_BRIEF_CHECKLIST.map((field) => field.label))}. For a post check the ${formatBriefLabels(POST_BRIEF_CHECKLIST.map((field) => field.label))}. When nothing important is missing, plan.`;

const PLAN_MODE_NO_QUESTION_INSTRUCTION =
  'You have already asked the questions you are allowed. Do not ask another one: plan now and state each assumption you made in the plan.';

/**
 * A reply that is not JSON-shaped. Text that opens a JSON object but does not
 * parse (a reply cut off at the token limit) still goes to review as a plan.
 */
function isProseReply(response: ReturnType<typeof parsePlanResponse>): boolean {
  return !response.parsed && !response.candidate.startsWith('{');
}

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
    private readonly autoModelResolver: AgentAutoModelResolverService,
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

    await this.streamEffects.publishStreamDoneOnly({
      content: response.message.content,
      context: params.context,
      creditsRemaining: response.creditsRemaining,
      creditsUsed: response.creditsUsed,
      metadata: response.message.metadata,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCalls: [],
    });

    return true;
  }

  async generatePlanModeResponse(
    params: PlanModeResponseParams,
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

    const {
      defaultModelKey,
      dispatchedModel,
      resolution: autoRouting,
    } = await this.resolvePlanModeAutoRouting(params);
    const canAskQuestions =
      countTrailingPlanQuestions(recentMessages) < MAX_PLAN_QUESTION_ROUNDS;
    const reservedRound = await this.runPlanningRound(
      params,
      history,
      autoRouting,
      dispatchedModel,
      canAskQuestions,
    );
    const response = reservedRound.response;

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No planning response from LLM');
    }

    const assistantContent = sanitizeAgentOutputText(
      choice.message.content || '',
    );
    const parsedResponse = parsePlanResponse(assistantContent);
    const question = canAskQuestions
      ? parsePlanQuestion(parsedResponse.parsed)
      : null;
    const persistInput = {
      autoRouting,
      assistantContent,
      defaultModelKey,
      host,
      params,
      reservedRound,
      resolvedModel: response.model ?? params.model,
    };

    if (question) {
      return this.persistPlanQuestion({ ...persistInput, question });
    }
    // Prose is an answer, not a plan: nothing in it is there to approve.
    return isProseReply(parsedResponse)
      ? this.persistPlanReply(persistInput)
      : this.persistPlanProposal(persistInput);
  }

  private async runPlanningRound(
    params: PlanModeResponseParams,
    history: OpenRouterMessage[],
    autoRouting: AgentAutoRoutingResolution | undefined,
    dispatchedModel: string,
    canAskQuestions: boolean,
  ) {
    const chatParams = await this.buildPlanningChatCompletionParams({
      autoRouting,
      canAskQuestions,
      messages: history,
      model: params.model,
      prompt: params.request.content,
      seedTitle: params.seedTitle,
      source: params.request.source,
      threadId: params.threadId,
    });
    return runReservedAgentLlmRound({
      actorUserId: params.context.userId,
      brandId: params.context.scope?.brandId,
      credits: this.creditsUtilsService,
      idempotencyKey: `${params.context.executionId ?? params.threadId}:agent-plan-round:1`,
      maximumCredits: await this.agentChatModelRegistry.getMaximumRoundCredits(
        params.model,
      ),
      organizationId: params.context.organizationId,
      pricer: this.agentChatModelRegistry,
      requestedModel: dispatchedModel,
      // A blank completion would persist a plan with nothing to review and
      // still ask for approval. Failing inside the round releases the hold,
      // so an empty answer is not billed.
      run: async () => {
        const response = await this.llmDispatcher.chatCompletion(
          chatParams,
          params.context.organizationId,
          {
            brandId: params.context.scope?.brandId,
            runId: params.context.executionId,
            threadId: params.threadId,
            userId: params.context.userId,
          },
        );
        const planText = sanitizeAgentOutputText(
          response.choices[0]?.message.content || '',
        );
        if (!planText.trim()) {
          throw new Error(
            'The planner returned an empty plan. Send the request again.',
          );
        }
        return response;
      },
      waived: params.turnCost === 0,
    });
  }

  private async persistPlanProposal(input: {
    autoRouting: AgentAutoRoutingResolution | undefined;
    assistantContent: string;
    defaultModelKey: string;
    host: AgentOrchestratorPlanModeHost;
    params: PlanModeResponseParams;
    reservedRound: { credits: number };
    resolvedModel: string;
  }): Promise<AgentChatResult> {
    const { params } = input;
    const envelope = this.extractPlanEnvelope({
      assistantContent: input.assistantContent,
      prompt: params.request.content,
      reviewMetadata: params.reviewMetadata,
      seedTitle: params.seedTitle,
    });
    const plan = envelope.plan;

    await input.host.maybeUpdateThreadTitle({
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
        autoRouting: input.autoRouting,
        defaultModelKey: input.defaultModelKey,
        model: params.model,
        prompt: params.request.content,
      }),
      ...buildResolvedModelMetadata(params.model, [input.resolvedModel]),
      proposedPlan: plan,
      reviewRequired: true,
      riskLevel: 'low' as const,
      totalCreditsUsed: input.reservedRound.credits,
    };
    const content =
      envelope.summary ||
      'I drafted a plan and paused here for your approval. Review it, then approve or request changes.';

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content,
      metadata: buildPersistedAgentResponseMetadata(
        assistantMetadata,
        creditsRemaining,
        params.context.executionId,
      ),
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
      creditsUsed: input.reservedRound.credits,
      message: {
        content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  /**
   * The planner answered in plain text instead of a plan, for example that it
   * cannot verify something. It is posted as an ordinary reply that asks for
   * no approval.
   */
  private async persistPlanReply(input: {
    autoRouting: AgentAutoRoutingResolution | undefined;
    assistantContent: string;
    defaultModelKey: string;
    host: AgentOrchestratorPlanModeHost;
    params: PlanModeResponseParams;
    reservedRound: { credits: number };
    resolvedModel: string;
  }): Promise<AgentChatResult> {
    const { params } = input;
    const runId = params.context.executionId;
    const { title } = this.extractPlanEnvelope({
      assistantContent: input.assistantContent,
      prompt: params.request.content,
      reviewMetadata: params.reviewMetadata,
      seedTitle: params.seedTitle,
    });

    await input.host.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title,
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...buildAgentRoutingMetadata({
        autoRouting: input.autoRouting,
        defaultModelKey: input.defaultModelKey,
        model: params.model,
        prompt: params.request.content,
      }),
      ...buildResolvedModelMetadata(params.model, [input.resolvedModel]),
      totalCreditsUsed: input.reservedRound.credits,
    };
    const content = input.assistantContent.trim();

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content,
      metadata: buildPersistedAgentResponseMetadata(
        assistantMetadata,
        creditsRemaining,
        runId,
      ),
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content,
      context: params.context,
      metadata: assistantMetadata,
      runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Plan mode answered without a plan',
      runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: input.reservedRound.credits,
      message: {
        content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  /**
   * The planner needs an answer before it can plan. The question goes out as
   * an input-request card and the run ends; the answer starts the next turn,
   * which plans again with it in the thread history.
   */
  private async persistPlanQuestion(input: {
    autoRouting: AgentAutoRoutingResolution | undefined;
    assistantContent: string;
    defaultModelKey: string;
    host: AgentOrchestratorPlanModeHost;
    params: PlanModeResponseParams;
    question: PlanModeQuestion;
    reservedRound: { credits: number };
    resolvedModel: string;
  }): Promise<AgentChatResult> {
    const { params, question } = input;
    const runId = params.context.executionId;
    const inputRequestId = `plan-question:${runId ?? `${params.threadId}:${Date.now()}`}`;
    const envelope = this.extractPlanEnvelope({
      assistantContent: input.assistantContent,
      prompt: params.request.content,
      reviewMetadata: params.reviewMetadata,
      seedTitle: params.seedTitle,
    });

    await input.host.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: envelope.title,
    });

    await this.streamEffects.publishStreamInputRequestEvent({
      allowFreeText: question.allowFreeText,
      inputRequestId,
      metadata: {
        brandId: params.context.scope?.brandId,
        contextVersion: params.context.scope?.contextVersion,
        kind: 'plan_question',
      },
      options: question.options,
      prompt: question.prompt,
      recommendedOptionId: question.recommendedOptionId,
      runId,
      threadId: params.threadId,
      title: question.title,
      userId: params.context.userId,
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...buildAgentRoutingMetadata({
        autoRouting: input.autoRouting,
        defaultModelKey: input.defaultModelKey,
        model: params.model,
        prompt: params.request.content,
      }),
      ...buildResolvedModelMetadata(params.model, [input.resolvedModel]),
      [PLAN_QUESTION_METADATA_KEY]: inputRequestId,
      totalCreditsUsed: input.reservedRound.credits,
    };
    // The prompt is the message so the next planning round reads the question
    // beside the answer.
    const content = question.prompt;

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content,
      metadata: buildPersistedAgentResponseMetadata(
        assistantMetadata,
        creditsRemaining,
        runId,
      ),
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content,
      context: params.context,
      metadata: assistantMetadata,
      runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Plan paused for an answer',
      runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: input.reservedRound.credits,
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

    // A host that cannot show a plan would leave the run paused with nothing
    // to approve, so its threads answer directly even if they were saved in
    // Plan mode.
    return (
      thread?.mode === AgentThreadMode.PLAN &&
      canThreadSourceReviewPlans(thread.source)
    );
  }

  /**
   * Plan mode is a single round with no tools (#4865): the decision sees a
   * round-1 turn that cannot call anything, which is what it is.
   */
  private async resolvePlanModeAutoRouting(params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    threadId: string;
  }): Promise<AgentAutoRoutingRound> {
    return resolveAgentAutoRoutingRound({
      context: params.context,
      hasPreviousRoundUsedTools: false,
      hasToolsAvailable: false,
      isTerminalRound: false,
      latestUserMessage: params.request.content,
      model: params.model,
      modelRegistry: this.agentChatModelRegistry,
      resolver: this.autoModelResolver,
      roundNumber: 1,
      source: params.request.source,
      threadId: params.threadId,
    });
  }

  private async buildPlanningChatCompletionParams(params: {
    autoRouting?: AgentAutoRoutingResolution;
    canAskQuestions: boolean;
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
    // Judged on the requested model, not the routed one — see
    // buildAgentChatCompletionParams.
    const routingPolicy = resolveAgentRoutingPolicy({
      defaultModelKey: await this.agentChatModelRegistry.getDefaultModelKey(),
      isWebSearchNeeded: params.autoRouting?.isWebSearchNeeded,
      model: params.model,
      prompt: params.prompt,
    });
    const routingPlugins = resolveAgentRoutingPlugins(routingPolicy) ?? [];
    const isGatewayAutoRouted =
      params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO &&
      params.autoRouting?.dispatchModelKey === undefined;
    const dispatchModel = params.autoRouting?.dispatchModelKey ?? params.model;
    const plugins = isGatewayAutoRouted
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
      content: `${PLAN_MODE_INSTRUCTION} ${
        params.canAskQuestions
          ? PLAN_MODE_QUESTION_INSTRUCTION
          : PLAN_MODE_NO_QUESTION_INSTRUCTION
      }`,
      role: 'system' as const,
    };

    return {
      max_tokens: 2048,
      messages: [planInstruction, ...params.messages],
      model: dispatchModel,
      ...(plugins.length > 0 ? { plugins } : {}),
      ...(isGatewayAutoRouted ? { session_id: params.threadId } : {}),
      temperature: 0.3,
    };
  }

  private extractPlanEnvelope(params: {
    assistantContent: string;
    prompt: string;
    reviewMetadata?: AgentPlanReviewMetadata;
    seedTitle: string;
  }): {
    title: string | null;
    summary: string;
    plan: {
      id: string;
      /** Stamped at creation so a client can order this plan against others. */
      createdAt: string;
      updatedAt: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval';
      awaitingApproval: true;
      lastReviewAction?: AgentPlanReviewMetadata['lastReviewAction'];
      revisionNote?: string;
    };
  } {
    const { candidate, parsed } = parsePlanResponse(params.assistantContent);
    // A question the planner was no longer allowed to ask is shown in the plan
    // as an open point instead of raw JSON.
    const openQuestion = parsePlanQuestion(parsed);

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : openQuestion
          ? `Open question: ${openQuestion.prompt}`
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

    const createdAtMs = Date.now();
    const createdAt = new Date(createdAtMs).toISOString();

    return {
      plan: {
        awaitingApproval: true,
        content,
        createdAt,
        ...(explanation ? { explanation } : {}),
        id: `plan-${createdAtMs}`,
        status: 'awaiting_approval',
        ...(steps ? { steps } : {}),
        updatedAt: createdAt,
        ...(params.reviewMetadata?.lastReviewAction
          ? { lastReviewAction: params.reviewMetadata.lastReviewAction }
          : {}),
        ...(params.reviewMetadata?.revisionNote
          ? { revisionNote: params.reviewMetadata.revisionNote }
          : {}),
      },
      summary,
      title,
    };
  }
}
