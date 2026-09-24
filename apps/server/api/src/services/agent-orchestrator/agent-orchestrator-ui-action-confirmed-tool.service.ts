import { createHash } from 'node:crypto';
import { mergeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { AgentGenerationDecisionService } from '@api/services/agent-orchestrator/agent-generation-decision.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { throwFailedUiActionResult } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-error';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { AgentOrchestratorUiActionMutationService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-mutation.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatResult,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { CacheService } from '@api/services/cache/cache.service';
import {
  buildLogicalWriteKey,
  type CuratedActionName,
} from '@genfeedai/actions';
import { toRouterPriority } from '@genfeedai/contracts';
import {
  type AgentToolResult,
  type AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

type ConfirmedToolAction =
  | 'confirm_mutation'
  | 'decline_mutation'
  | 'confirm_agent_transfer'
  | 'confirm_generate_media'
  | 'decline_generate_media'
  | 'confirm_install_official_workflow'
  | 'confirm_outreach_sequence'
  | 'confirm_publish_post'
  | 'confirm_save_brand_voice_profile';

type ToolExecutionOverrides = {
  generationModelOverride?: string;
  generationPriority?: ThreadUiActionExecutionParams['context']['generationPriority'];
  sourceActionId?: string;
  confirmationOrigin?: 'thread-ui-action';
};

@Injectable()
export class AgentOrchestratorUiActionConfirmedToolService {
  constructor(
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly finalizer: AgentOrchestratorUiActionFinalizerService,
    private readonly cacheService: CacheService,
    private readonly mutationActions: AgentOrchestratorUiActionMutationService,
    private readonly generationDecisions: AgentGenerationDecisionService,
  ) {}

  async execute(
    action: ConfirmedToolAction,
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    switch (action) {
      case 'confirm_mutation':
      case 'decline_mutation':
        return this.mutationActions.execute(action, params);
      case 'confirm_agent_transfer':
        return this.executeAgentTransfer(params);
      case 'confirm_install_official_workflow':
        return this.executeOfficialWorkflowInstall(params);
      case 'confirm_publish_post':
        return this.executePublishPost(params);
      case 'confirm_generate_media':
        return this.executeGenerateMedia(params);
      case 'decline_generate_media':
        return this.executeDeclineGeneration(params);
      case 'confirm_outreach_sequence':
        return this.executeOutreachSequence(params);
      case 'confirm_save_brand_voice_profile':
        return this.executeSaveBrandVoiceProfile(params);
    }
  }

  private async executeOutreachSequence(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const sourceActionId =
      typeof params.payload?.sourceActionId === 'string'
        ? params.payload.sourceActionId.trim()
        : '';
    const campaignId =
      typeof params.payload?.campaignId === 'string'
        ? params.payload.campaignId.trim()
        : '';
    const transition =
      params.payload?.transition === 'pause' ? 'pause' : 'start';
    if (!sourceActionId || !campaignId) {
      throw new BadRequestException(
        'Outreach sequence confirmation requires campaignId and sourceActionId.',
      );
    }
    const toolName =
      transition === 'pause'
        ? 'pause_outreach_sequence'
        : 'start_outreach_sequence';
    const execution = await this.executeTool(
      params,
      toolName,
      {
        campaignId,
        confirmed: true,
        sourceActionId,
      },
      { confirmationOrigin: 'thread-ui-action', sourceActionId },
    );
    if (!execution.result.success) {
      throwFailedUiActionResult(
        execution.result.error,
        `Failed to ${transition} the outreach sequence.`,
      );
    }
    return this.finalizer.finalizeStructuredAssistantTurn({
      content:
        transition === 'pause'
          ? 'Outreach sequence paused.'
          : 'Outreach sequence started.',
      context: params.context,
      eventIdempotencyKey: `outreach-sequence-result:${sourceActionId}`,
      model: params.model,
      result: execution.result,
      threadId: params.threadId,
      toolCalls: [execution.summary],
    });
  }

  private async executeAgentTransfer(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const sourceActionId =
      typeof params.payload?.sourceActionId === 'string'
        ? params.payload.sourceActionId.trim()
        : '';
    if (!sourceActionId) {
      throw new BadRequestException('Transfer source action is required.');
    }
    const idempotencyKey = [
      'agent-transfer-confirmation',
      params.context.organizationId,
      params.context.userId,
      params.threadId,
      sourceActionId,
    ].join(':');
    const toolPayload = { ...(params.payload ?? {}) };
    delete toolPayload.sourceActionId;
    delete toolPayload.sourceThreadId;
    return runIdempotent(this.cacheService, idempotencyKey, async () => {
      const execution = await this.executeTool(
        params,
        'transfer_agent_conversation',
        toolPayload,
        { confirmationOrigin: 'thread-ui-action', sourceActionId },
      );
      if (!execution.result.success) {
        throwFailedUiActionResult(
          execution.result.error,
          'Failed to start the destination conversation.',
        );
      }
      return this.finalizer.finalizeStructuredAssistantTurn({
        content: 'The handoff was sent and the destination run was queued.',
        context: params.context,
        eventIdempotencyKey: `agent-transfer-result:${sourceActionId}`,
        model: params.model,
        result: execution.result,
        threadId: params.threadId,
        toolCalls: [execution.summary],
      });
    });
  }

  private async executeOfficialWorkflowInstall(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const sourceActionId =
      typeof params.payload?.sourceActionId === 'string'
        ? params.payload.sourceActionId.trim()
        : '';
    const toolPayload = { ...(params.payload ?? {}), confirmed: true };
    const execution = await this.executeTool(
      params,
      'install_official_workflow',
      toolPayload,
      {
        confirmationOrigin: 'thread-ui-action',
        ...(sourceActionId ? { sourceActionId } : {}),
      },
    );
    if (!execution.result.success) {
      throwFailedUiActionResult(
        execution.result.error,
        'Failed to execute workflow install confirmation.',
      );
    }
    return this.finalizer.finalizeStructuredAssistantTurn({
      content: 'Official workflow installed.',
      context: params.context,
      model: params.model,
      result: execution.result,
      threadId: params.threadId,
      toolCalls: [execution.summary],
    });
  }

  private async executePublishPost(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const sourceActionId =
      typeof params.payload?.sourceActionId === 'string'
        ? params.payload.sourceActionId.trim()
        : '';
    const toolPayload = { ...(params.payload ?? {}), confirmed: true };
    const execution = await this.executeTool(
      params,
      'create_post',
      toolPayload,
      {
        confirmationOrigin: 'thread-ui-action',
        ...(sourceActionId ? { sourceActionId } : {}),
      },
    );
    if (!execution.result.success) {
      throwFailedUiActionResult(
        execution.result.error,
        'Failed to publish content.',
      );
    }

    const totalCreated =
      typeof execution.result.data?.totalCreated === 'number'
        ? execution.result.data.totalCreated
        : 0;
    const scheduledAt =
      typeof execution.result.data?.scheduledAt === 'string' &&
      execution.result.data.scheduledAt.trim()
        ? execution.result.data.scheduledAt.trim()
        : null;
    const createdPlatforms = Array.isArray(
      execution.result.data?.createdPlatforms,
    )
      ? (execution.result.data.createdPlatforms as string[])
      : [];
    const platformSummary = createdPlatforms.length
      ? ` on ${createdPlatforms.join(', ')}`
      : '';
    const content = scheduledAt
      ? `Scheduled ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary}.`
      : `Queued ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary} for publishing.`;

    return this.finalizer.finalizeStructuredAssistantTurn({
      content,
      context: params.context,
      model: params.model,
      result: execution.result,
      threadId: params.threadId,
      toolCalls: [execution.summary],
    });
  }

  private async executeSaveBrandVoiceProfile(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const toolPayload = { ...(params.payload ?? {}) };
    const sourceActionId =
      typeof toolPayload.sourceActionId === 'string'
        ? toolPayload.sourceActionId.trim()
        : undefined;
    delete toolPayload.sourceActionId;
    const execution = await this.executeTool(
      params,
      'save_brand_voice_profile' as CuratedActionName,
      toolPayload,
      { confirmationOrigin: 'thread-ui-action', sourceActionId },
    );
    if (!execution.result.success || execution.result.requiresConfirmation) {
      throwFailedUiActionResult(
        execution.result.error,
        'Failed to save brand voice.',
      );
    }
    return this.finalizer.finalizeStructuredAssistantTurn({
      content: 'Brand voice saved to the selected brand.',
      context: params.context,
      model: params.model,
      result: execution.result,
      threadId: params.threadId,
      toolCalls: [execution.summary],
    });
  }

  private async executeGenerateMedia(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const request = this.readMediaRequest(params);
    const decisionCard = await this.generationDecisions.transition(
      params,
      'approved',
    );
    const executionSourceActionId = buildLogicalWriteKey({
      organizationId: params.context.organizationId,
      userId: params.context.userId,
      threadId: params.threadId,
      toolName: request.toolName,
      arguments: {
        sourceActionId: request.sourceActionId,
        generationType: request.generationType,
        model: request.model,
        prioritize: request.priority,
        ...request.toolPayload,
      },
    });
    const idempotencyKey = [
      'agent-media',
      params.context.organizationId,
      params.context.userId,
      params.threadId,
      executionSourceActionId,
      request.generationType,
      request.outputs ?? 1,
    ].join(':');

    const response = await runIdempotent(
      this.cacheService,
      idempotencyKey,
      async () => {
        const execution = await this.executeTool(
          params,
          request.toolName,
          request.toolPayload,
          {
            // #4672: generate_image/generate_video are gated (approval-
            // required) in Manual mode so an unconfirmed agent tool call
            // docks the review card instead of spending credits. This
            // explicit "Generate" click IS that confirmation — without
            // `confirmationOrigin` it would re-enter the same gate and dock
            // another card instead of running the generation.
            confirmationOrigin: 'thread-ui-action',
            generationModelOverride: request.model,
            generationPriority: request.priority,
            sourceActionId: executionSourceActionId,
          },
        );
        if (!execution.result.success) {
          throwFailedUiActionResult(
            execution.result.error,
            `Failed to generate ${request.generationType}.`,
          );
        }
        const linkedResult = {
          ...execution.result,
          nextActions: [
            ...(execution.result.nextActions ?? []).map((action) => ({
              ...action,
              data: {
                ...(action.data ?? {}),
                sourceGenerationActionId: request.sourceActionId,
              },
            })),
          ],
        };
        return this.finalizer.finalizeStructuredAssistantTurn({
          content: `${request.generationType === 'image' ? 'Image' : 'Video'} generation accepted.`,
          context: params.context,
          eventIdempotencyKey: `agent-media-result:${executionSourceActionId}`,
          model: params.model,
          result: linkedResult,
          threadId: params.threadId,
          toolCalls: [execution.summary],
        });
      },
      // Persisted source-action placeholders recover media after an API crash,
      // so a stale in-memory reservation must not block the one-hour replay.
      { lockTtlSeconds: 120 },
    );
    return this.withGenerationDecision(response, decisionCard);
  }

  private async executeDeclineGeneration(
    params: ThreadUiActionExecutionParams,
  ): Promise<AgentChatResult> {
    const card = await this.generationDecisions.transition(params, 'declined');
    const digest = createHash('sha256')
      .update(
        [
          params.context.organizationId,
          params.context.userId,
          params.threadId,
          card.id,
          'declined',
        ].join('\u001f'),
      )
      .digest('hex');
    const messageId = [
      digest.slice(0, 8),
      digest.slice(8, 12),
      `5${digest.slice(13, 16)}`,
      `a${digest.slice(17, 20)}`,
      digest.slice(20, 32),
    ].join('-');
    const response = await this.finalizer.finalizeStructuredAssistantTurn({
      content: 'Generation declined. No credits were charged.',
      context: params.context,
      eventIdempotencyKey: `agent-media-declined:${card.id}`,
      messageId,
      model: params.model,
      result: { creditsUsed: 0, success: true },
      threadId: params.threadId,
      toolCalls: [],
    });
    return this.withGenerationDecision(response, card);
  }

  private withGenerationDecision(
    response: AgentChatResult,
    card: AgentUiAction,
  ): AgentChatResult {
    const metadata = response.message.metadata;
    return {
      ...response,
      message: {
        ...response.message,
        metadata: {
          ...metadata,
          uiActions: [
            card,
            ...(Array.isArray(metadata?.uiActions) ? metadata.uiActions : []),
          ],
        },
      },
    };
  }

  private readMediaRequest(params: ThreadUiActionExecutionParams) {
    const generationType = params.payload?.generationType;
    if (generationType !== 'image' && generationType !== 'video') {
      throw new BadRequestException('Generation type must be image or video.');
    }
    const prompt =
      typeof params.payload?.prompt === 'string'
        ? params.payload.prompt.trim()
        : '';
    if (!prompt || prompt.length > 4_000) {
      throw new BadRequestException(
        'Generation prompt must contain between 1 and 4000 characters.',
      );
    }
    const sourceActionId =
      typeof params.payload?.sourceActionId === 'string'
        ? params.payload.sourceActionId.trim()
        : '';
    if (!sourceActionId) {
      throw new BadRequestException('Generation source action is required.');
    }
    const duration = params.payload?.duration;
    if (
      generationType === 'video' &&
      duration !== undefined &&
      (typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration < 1 ||
        duration > 60)
    ) {
      throw new BadRequestException(
        'Video duration must be between 1 and 60 seconds.',
      );
    }
    const outputs = params.payload?.outputs;
    if (
      generationType === 'image' &&
      outputs !== undefined &&
      (typeof outputs !== 'number' ||
        !Number.isInteger(outputs) ||
        outputs < 1 ||
        outputs > 8)
    ) {
      throw new BadRequestException(
        'Outputs must be an integer between 1 and 8.',
      );
    }
    const model =
      typeof params.payload?.model === 'string' && params.payload.model.trim()
        ? params.payload.model.trim()
        : undefined;
    const references = Array.isArray(params.payload?.references)
      ? params.payload.references.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : undefined;
    const videoReferences = Array.isArray(params.payload?.videoReferences)
      ? params.payload.videoReferences.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : undefined;
    const aspectRatio =
      typeof params.payload?.aspectRatio === 'string' &&
      params.payload.aspectRatio.trim()
        ? params.payload.aspectRatio.trim()
        : undefined;
    const endFrame =
      typeof params.payload?.endFrame === 'string' &&
      params.payload.endFrame.trim()
        ? params.payload.endFrame.trim()
        : undefined;
    const resolution =
      typeof params.payload?.resolution === 'string' &&
      params.payload.resolution.trim()
        ? params.payload.resolution.trim()
        : undefined;
    const requestedSkillSlugs = mergeRequestedSkillSlugs(
      params.context.requestedSkillSlugs,
      params.payload?.requestedSkillSlugs,
    );
    const harness = params.payload?.harness;
    if (harness !== undefined && typeof harness !== 'boolean')
      throw new BadRequestException('harness must be a boolean');
    const commonToolPayload = {
      ...(requestedSkillSlugs ? { requestedSkillSlugs } : {}),
      ...(harness !== undefined ? { harness } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      prompt,
      ...(references && references.length > 0 ? { references } : {}),
    };
    return {
      generationType,
      model,
      outputs: generationType === 'image' ? outputs : undefined,
      priority:
        toRouterPriority(
          typeof params.payload?.prioritize === 'string'
            ? params.payload.prioritize
            : undefined,
        ) ?? params.context.generationPriority,
      sourceActionId,
      toolName:
        generationType === 'video'
          ? ('generate_video' as const)
          : ('generate_image' as const),
      toolPayload:
        generationType === 'image'
          ? {
              ...commonToolPayload,
              ...(typeof outputs === 'number' ? { outputs } : {}),
            }
          : {
              ...commonToolPayload,
              ...(typeof duration === 'number' ? { duration } : {}),
              ...(endFrame ? { endFrame } : {}),
              ...(resolution ? { resolution } : {}),
              ...(videoReferences && videoReferences.length > 0
                ? { videoReferences }
                : {}),
            },
    };
  }

  private async executeTool(
    params: ThreadUiActionExecutionParams,
    toolName: CuratedActionName,
    toolPayload: Record<string, unknown>,
    overrides: ToolExecutionOverrides = {},
  ): Promise<{ result: AgentToolResult; summary: ToolCallSummary }> {
    const startTime = Date.now();
    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.executionId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        ...(params.context.requestedSkillSlugs?.length
          ? { requestedSkillSlugs: params.context.requestedSkillSlugs }
          : {}),
        brandId: params.context.scope?.brandId,
        generationModelOverride: overrides.generationModelOverride,
        generationPriority:
          overrides.generationPriority ?? params.context.generationPriority,
        organizationId: params.context.organizationId,
        confirmationOrigin: overrides.confirmationOrigin,
        runId: params.context.executionId,
        sourceActionId: overrides.sourceActionId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        validatedScope: params.context.scope,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
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
    return { result, summary };
  }
}
