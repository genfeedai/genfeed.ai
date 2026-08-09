import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentThreadUiActionRequest,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { captureRunArtifacts } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import {
  buildAgentScopeMetadata,
  recordAgentRunScope,
  withAgentScopeResult,
} from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import { normalizeUiBlocks } from '@api/services/agent-orchestrator/utils/agent-ui-blocks.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import {
  AgentRuntimeSessionService,
  getRuntimeBindingEffect,
} from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import {
  AgentAutonomyMode,
  AgentMessageRole,
  AgentThreadStatus,
  RouterPriority,
  toRouterPriority,
} from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentToolResult,
  type AgentUiAction,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

const BRAND_IDENTITY_MESSAGE_PAGE_SIZE = 100;
const BRAND_IDENTITY_MESSAGE_MAX_PAGES = 50;

/**
 * Host callbacks into the orchestrator for plan-follow-up turns that still
 * live on the main chat loops (phase 2 keeps those on the orchestrator).
 */
export type AgentOrchestratorUiActionHost = {
  executeSynchronousChatLoop: (params: {
    context: AgentChatContext;
    generationPriority: RouterPriority;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  generatePlanModeResponse: (params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    reviewMetadata?: {
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
    };
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  runInThreadLane: <T>(threadId: string, run: () => Promise<T>) => Promise<T>;
};

@Injectable()
export class AgentOrchestratorUiActionService {
  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentRunsService: AgentRunsService,
    private readonly cacheService: CacheService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async handleThreadUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const threadId = await this.findAccessibleThreadId(
      request.threadId,
      context.organizationId,
      context.userId,
    );

    if (!threadId) {
      throw new BadRequestException('Thread not found or inaccessible.');
    }

    const execute = () =>
      this.handleThreadUiActionOnce(request, context, host, threadId);
    if (!this.isBrandIdentityConfirmationAction(request.action)) {
      return execute();
    }

    const sourceActionId = this.readRequiredSourceActionId(request.payload);
    const idempotencyKey = [
      'agent-brand-confirmation',
      context.organizationId,
      context.userId,
      threadId,
      request.action,
      sourceActionId,
    ].join(':');
    return runIdempotent(this.cacheService, idempotencyKey, execute);
  }

  private async handleThreadUiActionOnce(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
    host: AgentOrchestratorUiActionHost,
    threadId: string,
  ): Promise<AgentChatResult> {
    const threadRecord = await this.agentThreadsService.findOne({
      id: threadId,
      organizationId: context.organizationId,
    });
    // A soft-deleted thread must not trip the archived gate — treat it like a
    // missing record, exactly as the previous isDeleted filter did.
    const activeThreadRecord =
      threadRecord && !threadRecord.isDeleted ? threadRecord : null;
    const threadStatus = String(
      (activeThreadRecord as { status?: string | null } | null)?.status ?? '',
    ).toLowerCase();
    if (
      threadStatus === AgentThreadStatus.ARCHIVED ||
      threadStatus === 'archived'
    ) {
      throw new BadRequestException(
        'This thread is archived. Unarchive it before sending messages or running actions.',
      );
    }

    const orgSettings = await this.organizationSettingsService.findOne({
      organizationId: context.organizationId,
    });
    const { policy: basePolicy } = resolveEffectiveAgentExecutionConfig({
      organizationSettings: orgSettings,
    });

    const model = await this.resolveThreadUiActionModel(
      threadId,
      context.organizationId,
    );
    const actionContent = this.describeThreadUiAction(
      request.action,
      request.payload,
    );

    return await host.runInThreadLane(threadId, async () => {
      const scope = await this.resolveUiActionScopeInsideLane({
        basePolicyBrandId: basePolicy.brandId,
        context,
        request,
        threadId,
      });
      context = {
        ...context,
        generationPriority: basePolicy.generationPriority,
        scope,
      };
      await recordAgentRunScope(this.agentRunsService, context);
      await this.threadEventRecorder.recordThreadTurnRequested({
        content: actionContent,
        context,
        model,
        runId: context.runId,
        threadId,
      });
      await this.threadEventRecorder.recordThreadTurnStarted({
        context,
        model,
        runId: context.runId,
        threadId,
      });

      try {
        let result: AgentChatResult;
        let responseScope = scope;
        switch (request.action) {
          case 'approve_plan':
            result = await this.executeApprovedPlanAction(
              {
                context,
                model,
                payload: request.payload,
                threadId,
              },
              host,
            );
            break;
          case 'revise_plan':
            result = await this.executeRevisedPlanAction(
              {
                context,
                model,
                payload: request.payload,
                threadId,
              },
              host,
            );
            break;
          case 'confirm_install_official_workflow':
            result = await this.executeConfirmedInstallOfficialWorkflowAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'confirm_create_brand': {
            const confirmed = await this.executeConfirmedBrandIdentityAction({
              context,
              model,
              operation: 'create',
              payload: request.payload,
              threadId,
            });
            result = confirmed.result;
            responseScope = confirmed.scope;
            break;
          }
          case 'confirm_rename_brand': {
            const confirmed = await this.executeConfirmedBrandIdentityAction({
              context,
              model,
              operation: 'rename',
              payload: request.payload,
              threadId,
            });
            result = confirmed.result;
            responseScope = confirmed.scope;
            break;
          }
          case 'confirm_save_brand_voice_profile':
            result = await this.executeConfirmedSaveBrandVoiceProfileAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'confirm_publish_post':
            result = await this.executeConfirmedPublishPostAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'confirm_generate_media':
            result = await this.executeConfirmedGenerateMediaAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          default:
            throw new BadRequestException(
              `Unsupported thread UI action: ${request.action}`,
            );
        }
        return withAgentScopeResult(result, responseScope);
      } catch (error: unknown) {
        await this.threadEventRecorder.recordRunFailed({
          context,
          error:
            error instanceof Error
              ? error.message
              : `Thread UI action failed: ${request.action}`,
          runId: context.runId,
          threadId,
        });
        throw error;
      }
    });
  }

  private isBrandIdentityConfirmationAction(action: string): boolean {
    return (
      action === 'confirm_create_brand' || action === 'confirm_rename_brand'
    );
  }

  private readRequiredSourceActionId(
    payload?: Record<string, unknown>,
  ): string {
    const sourceActionId =
      typeof payload?.sourceActionId === 'string'
        ? payload.sourceActionId.trim()
        : '';
    if (
      !/^brand-identity-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sourceActionId,
      )
    ) {
      throw new BadRequestException(
        'Brand identity confirmation requires a valid source action.',
      );
    }
    return sourceActionId;
  }

  private async resolveUiActionScopeInsideLane(params: {
    basePolicyBrandId?: string;
    context: AgentChatContext;
    request: AgentThreadUiActionRequest;
    threadId: string;
  }): Promise<ValidatedAgentScope> {
    const isBrandConfirmation = this.isBrandIdentityConfirmationAction(
      params.request.action,
    );
    let expectedContextVersion = params.request.expectedContextVersion;
    let requestedBrandId = params.request.brandId;

    if (isBrandConfirmation) {
      const currentThread = await this.agentThreadsService.findOne({
        id: params.threadId,
        isDeleted: false,
        organizationId: params.context.organizationId,
        userId: { in: [params.context.userId] },
      });
      const currentVersion = (
        currentThread as { contextVersion?: unknown } | null
      )?.contextVersion;
      if (typeof currentVersion !== 'number') {
        throw new BadRequestException(
          'Thread context is unavailable for brand confirmation.',
        );
      }
      expectedContextVersion = currentVersion;
      requestedBrandId =
        typeof (currentThread as { brandId?: unknown }).brandId === 'string'
          ? String((currentThread as { brandId: string }).brandId)
          : null;
    }

    const preparedScope = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion,
      organizationId: params.context.organizationId,
      ...(isBrandConfirmation
        ? {}
        : { policyBrandId: params.basePolicyBrandId }),
      requestedBrandId,
      threadId: params.threadId,
      userId: params.context.userId,
    });
    const scope = preparedScope.existingScope;
    if (!scope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }
    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'tool',
    );
    return scope;
  }

  private async findAccessibleThreadId(
    threadId: string | undefined,
    organizationId: string,
    userId: string,
  ): Promise<string | null> {
    if (!isEntityId(threadId)) {
      return null;
    }

    const thread = await this.agentThreadsService.findOne({
      id: threadId,
      organizationId: organizationId,
      userId: { in: [userId] },
    });

    return thread ? String(thread.id) : null;
  }

  private async resolveThreadUiActionModel(
    threadId: string,
    organizationId: string,
  ): Promise<string> {
    const binding = await runEffectPromise(
      getRuntimeBindingEffect(
        this.agentRuntimeSessionService,
        threadId,
        organizationId,
      ),
    );

    // UI actions price and call the bound model directly, bypassing the
    // orchestrator's resolution chokepoint — a binding stored against a retired
    // key maps forward here or it bills at the fallback rate.
    return this.agentChatModelRegistry.resolveModelKey(binding?.model);
  }

  private describeThreadUiAction(
    action: string,
    payload?: Record<string, unknown>,
  ): string {
    if (action === 'approve_plan') {
      const planId =
        typeof payload?.planId === 'string' && payload.planId.trim()
          ? payload.planId.trim()
          : 'current plan';

      return `Approved plan ${planId}.`;
    }

    if (action === 'revise_plan') {
      const note =
        typeof payload?.revisionNote === 'string' && payload.revisionNote.trim()
          ? payload.revisionNote.trim()
          : 'with requested changes';

      return `Requested plan changes: ${note}.`;
    }

    if (action === 'confirm_install_official_workflow') {
      const sourceName =
        typeof payload?.sourceName === 'string' && payload.sourceName.trim()
          ? payload.sourceName.trim()
          : 'official workflow';

      return `Confirmed install for ${sourceName}.`;
    }

    if (
      action === 'confirm_create_brand' ||
      action === 'confirm_rename_brand'
    ) {
      const label =
        typeof payload?.label === 'string' && payload.label.trim()
          ? payload.label.trim()
          : 'brand';

      return action === 'confirm_create_brand'
        ? `Confirmed brand creation for ${label}.`
        : `Confirmed brand rename to ${label}.`;
    }

    if (action === 'confirm_publish_post') {
      const contentId =
        typeof payload?.contentId === 'string' && payload.contentId.trim()
          ? payload.contentId.trim()
          : 'selected content';

      return `Confirmed publish for ${contentId}.`;
    }

    if (action === 'confirm_generate_media') {
      const generationType =
        payload?.generationType === 'video' ? 'video' : 'image';

      return `Confirmed ${generationType} generation.`;
    }

    if (action === 'confirm_save_brand_voice_profile') {
      const brandId =
        typeof payload?.brandId === 'string' && payload.brandId.trim()
          ? payload.brandId.trim()
          : 'selected brand';

      return `Approved brand voice draft for ${brandId}.`;
    }

    return `Triggered thread UI action: ${action}`;
  }

  private async executeConfirmedBrandIdentityAction(params: {
    context: AgentChatContext;
    model: string;
    operation: 'create' | 'rename';
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<{ result: AgentChatResult; scope: ValidatedAgentScope }> {
    const scope = params.context.scope;
    if (!scope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }

    const sourceActionId = this.readRequiredSourceActionId(params.payload);
    const proposal = await this.loadBrandIdentityProposal({
      operation: params.operation,
      organizationId: params.context.organizationId,
      sourceActionId,
      threadId: params.threadId,
    });
    const toolName =
      params.operation === 'create'
        ? AgentToolName.CREATE_BRAND
        : AgentToolName.RENAME_BRAND;
    const toolPayload = { ...(params.payload ?? {}) };
    const mutationKey = [
      'agent-brand-mutation',
      params.context.organizationId,
      params.context.userId,
      params.threadId,
      params.operation,
      sourceActionId,
    ].join(':');
    const execution = await runIdempotent(
      this.cacheService,
      mutationKey,
      async (): Promise<{
        result: AgentToolResult;
        summary: ToolCallSummary;
      }> => {
        const isPotentialBoundCreateRetry =
          params.operation === 'create' &&
          !!scope.brandId &&
          scope.contextVersion === proposal.contextVersion + 1;
        if (!isPotentialBoundCreateRetry) {
          this.assertProposalMatchesScope(proposal, scope);
        }
        const startTime = Date.now();

        await this.threadEventRecorder.recordToolStarted({
          context: params.context,
          parameters: toolPayload,
          runId: params.context.runId,
          threadId: params.threadId,
          toolName,
        });
        const result = await this.toolExecutorService.executeTool(
          toolName,
          toolPayload,
          {
            apiKeyContext: params.context.apiKeyContext,
            authToken: params.context.authToken,
            brandId: scope.brandId,
            confirmationOrigin: 'thread-ui-action',
            generationPriority: params.context.generationPriority,
            organizationId: params.context.organizationId,
            runId: params.context.runId,
            strategyId: params.context.strategyId,
            threadId: params.threadId,
            userId: params.context.userId,
            validatedScope: scope,
          },
        );
        const durationMs = Date.now() - startTime;
        const summary: ToolCallSummary = {
          creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
          durationMs,
          error: result.error,
          parameters: toolPayload,
          status: result.success ? 'completed' : 'failed',
          toolName,
        };

        await this.threadEventRecorder.recordToolCompleted({
          context: params.context,
          durationMs,
          error: summary.error,
          runId: params.context.runId,
          status: summary.status,
          threadId: params.threadId,
          toolName,
        });

        if (!result.success) {
          throw new InternalServerErrorException(
            result.error ?? `Failed to ${params.operation} brand.`,
          );
        }
        return { result, summary };
      },
    );
    const { result, summary } = execution;

    let confirmedScope = scope;
    let finalizedContext = params.context;
    let scopedResult = result;

    if (params.operation === 'create') {
      const brandId =
        typeof result.data?.brandId === 'string' && result.data.brandId.trim()
          ? result.data.brandId.trim()
          : typeof result.data?.id === 'string' && result.data.id.trim()
            ? result.data.id.trim()
            : '';
      if (!brandId) {
        throw new InternalServerErrorException(
          'Confirmed brand creation did not return a brand identifier.',
        );
      }

      const isAlreadyBoundRetry =
        scope.brandId === brandId &&
        scope.contextVersion === proposal.contextVersion + 1;
      if (!isAlreadyBoundRetry) {
        this.assertProposalMatchesScope(proposal, scope);
      }
      const updatedThread = isAlreadyBoundRetry
        ? { brandId, contextVersion: scope.contextVersion }
        : await this.agentScopeContextService.mutateBrandScope({
            brandId,
            expectedContextVersion: scope.contextVersion,
            organizationId: params.context.organizationId,
            threadId: params.threadId,
            userId: params.context.userId,
          });
      const contextVersion = updatedThread.contextVersion;
      if (typeof contextVersion !== 'number') {
        throw new InternalServerErrorException(
          'Confirmed brand creation did not return an updated context version.',
        );
      }
      const refreshed = await this.agentScopeContextService.prepareForTurn({
        expectedContextVersion: contextVersion,
        organizationId: params.context.organizationId,
        requestedBrandId: brandId,
        threadId: params.threadId,
        userId: params.context.userId,
      });
      if (!refreshed.existingScope) {
        throw new InternalServerErrorException(
          'Unable to refresh the confirmed brand scope.',
        );
      }

      confirmedScope = refreshed.existingScope;
      finalizedContext = { ...params.context, scope: confirmedScope };
      scopedResult = {
        ...result,
        data: {
          ...(result.data ?? {}),
          brandId,
          contextVersion: confirmedScope.contextVersion,
        },
      };
      await recordAgentRunScope(this.agentRunsService, finalizedContext);
    } else {
      this.assertProposalMatchesScope(proposal, scope);
    }

    const label =
      typeof scopedResult.data?.label === 'string' &&
      scopedResult.data.label.trim()
        ? scopedResult.data.label.trim()
        : 'Brand';
    const completionContent =
      params.operation === 'create'
        ? `${label} created and selected for this conversation.`
        : `${label} renamed.`;
    const finalized =
      (await this.findFinalizedBrandIdentityAction({
        context: finalizedContext,
        operation: params.operation,
        organizationId: params.context.organizationId,
        result: scopedResult,
        sourceActionId,
        threadId: params.threadId,
        toolCalls: [summary],
      })) ??
      (await this.finalizeStructuredAssistantTurn({
        content: completionContent,
        context: finalizedContext,
        eventIdempotencyKey: sourceActionId,
        metadata: {
          brandIdentityConfirmationResult: {
            operation: params.operation,
            sourceActionId,
          },
        },
        model: params.model,
        result: scopedResult,
        threadId: params.threadId,
        toolCalls: [summary],
      }));
    await this.consumeBrandIdentityProposal({
      contextVersion: confirmedScope.contextVersion,
      messageId: proposal.messageId,
      metadata: proposal.metadata,
      operation: params.operation,
      organizationId: params.context.organizationId,
      sourceActionId,
      threadId: params.threadId,
    });

    return { result: finalized, scope: confirmedScope };
  }

  private async loadBrandIdentityProposal(params: {
    operation: 'create' | 'rename';
    organizationId: string;
    sourceActionId: string;
    threadId: string;
  }): Promise<{
    brandId?: string;
    contextVersion: number;
    messageId: string;
    metadata: Record<string, unknown>;
  }> {
    const expectedAction =
      params.operation === 'create'
        ? 'confirm_create_brand'
        : 'confirm_rename_brand';

    for (let page = 1; page <= BRAND_IDENTITY_MESSAGE_MAX_PAGES; page++) {
      const messages = await this.agentMessagesService.getMessagesByRoom(
        params.threadId,
        params.organizationId,
        { limit: BRAND_IDENTITY_MESSAGE_PAGE_SIZE, page },
      );
      for (const message of messages) {
        if (String(message.role).toLowerCase() !== AgentMessageRole.ASSISTANT) {
          continue;
        }
        const metadata = this.readRecord(message.metadata);
        const consumed = this.readRecord(metadata.consumedBrandIdentityActions);
        if (consumed[params.sourceActionId]) {
          throw new ConflictException(
            'This brand identity confirmation has already been consumed.',
          );
        }
        const uiActions = Array.isArray(metadata.uiActions)
          ? metadata.uiActions
          : [];
        for (const rawAction of uiActions) {
          const action = this.readRecord(rawAction);
          const data = this.readRecord(action.data);
          if (action.id !== params.sourceActionId) {
            continue;
          }
          if (
            action.type !== 'brand_identity_confirmation_card' ||
            data.operation !== params.operation ||
            data.sourceActionId !== params.sourceActionId
          ) {
            throw new BadRequestException(
              'Brand identity proposal does not match this confirmation.',
            );
          }
          const ctas = Array.isArray(action.ctas) ? action.ctas : [];
          const hasMatchingCta = ctas.some((rawCta) => {
            const cta = this.readRecord(rawCta);
            const payload = this.readRecord(cta.payload);
            return (
              cta.action === expectedAction &&
              payload.sourceActionId === params.sourceActionId
            );
          });
          if (!hasMatchingCta) {
            throw new BadRequestException(
              'Brand identity proposal action does not match this confirmation.',
            );
          }

          const proposalScope = this.readRecord(data.proposalScope);
          const metadataScope = this.readRecord(metadata.agentScope);
          const contextVersion = proposalScope.contextVersion;
          if (
            typeof contextVersion !== 'number' ||
            metadataScope.contextVersion !== contextVersion
          ) {
            throw new BadRequestException(
              'Brand identity proposal is missing authoritative scope metadata.',
            );
          }
          const proposalBrandId =
            typeof proposalScope.brandId === 'string'
              ? proposalScope.brandId
              : undefined;
          const metadataBrandId =
            typeof metadataScope.brandId === 'string'
              ? metadataScope.brandId
              : undefined;
          if (proposalBrandId !== metadataBrandId) {
            throw new BadRequestException(
              'Brand identity proposal scope metadata is inconsistent.',
            );
          }

          return {
            brandId: proposalBrandId,
            contextVersion,
            messageId: String(message.id),
            metadata,
          };
        }
      }
      if (messages.length < BRAND_IDENTITY_MESSAGE_PAGE_SIZE) {
        break;
      }
    }

    throw new BadRequestException(
      'Brand identity proposal was not found in this thread.',
    );
  }

  private async findFinalizedBrandIdentityAction(params: {
    context: AgentChatContext;
    operation: 'create' | 'rename';
    organizationId: string;
    result: AgentToolResult;
    sourceActionId: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<AgentChatResult | null> {
    for (let page = 1; page <= BRAND_IDENTITY_MESSAGE_MAX_PAGES; page++) {
      const messages = await this.agentMessagesService.getMessagesByRoom(
        params.threadId,
        params.organizationId,
        { limit: BRAND_IDENTITY_MESSAGE_PAGE_SIZE, page },
      );
      for (const message of messages) {
        if (String(message.role).toLowerCase() !== AgentMessageRole.ASSISTANT) {
          continue;
        }
        const metadata = this.readRecord(message.metadata);
        const marker = this.readRecord(
          metadata.brandIdentityConfirmationResult,
        );
        if (
          marker.sourceActionId !== params.sourceActionId ||
          marker.operation !== params.operation
        ) {
          continue;
        }
        const creditsRemaining =
          typeof metadata.creditsRemaining === 'number'
            ? metadata.creditsRemaining
            : await this.creditsUtilsService.getOrganizationCreditsBalance(
                params.organizationId,
              );
        const messageMetadata = { ...metadata };
        delete messageMetadata.creditsRemaining;
        const content =
          typeof message.content === 'string' ? message.content : '';
        await this.threadEventRecorder.recordAssistantFinalized({
          content,
          context: params.context,
          idempotencyKey: params.sourceActionId,
          metadata: messageMetadata,
          runId: params.context.runId,
          threadId: params.threadId,
        });
        await this.threadEventRecorder.recordRunCompleted({
          context: params.context,
          detail: 'Agent completed',
          idempotencyKey: params.sourceActionId,
          runId: params.context.runId,
          threadId: params.threadId,
        });
        return {
          creditsRemaining,
          creditsUsed: params.result.creditsUsed ?? 0,
          message: {
            content,
            metadata: messageMetadata,
            role: 'assistant',
          },
          threadId: params.threadId,
          toolCalls: params.toolCalls,
        };
      }
      if (messages.length < BRAND_IDENTITY_MESSAGE_PAGE_SIZE) {
        break;
      }
    }
    return null;
  }

  private assertProposalMatchesScope(
    proposal: { brandId?: string; contextVersion: number },
    scope: ValidatedAgentScope,
  ): void {
    if (
      proposal.brandId !== scope.brandId ||
      proposal.contextVersion !== scope.contextVersion
    ) {
      throw new ConflictException(
        'Brand identity proposal is stale for the current thread scope.',
      );
    }
  }

  private async consumeBrandIdentityProposal(params: {
    contextVersion: number;
    messageId: string;
    metadata: Record<string, unknown>;
    operation: 'create' | 'rename';
    organizationId: string;
    sourceActionId: string;
    threadId: string;
  }): Promise<void> {
    const consumed = this.readRecord(
      params.metadata.consumedBrandIdentityActions,
    );
    const result = await this.agentMessagesService.patchAll(
      {
        id: params.messageId,
        organizationId: params.organizationId,
        threadId: params.threadId,
      },
      {
        metadata: {
          ...params.metadata,
          consumedBrandIdentityActions: {
            ...consumed,
            [params.sourceActionId]: {
              consumedAt: new Date().toISOString(),
              contextVersion: params.contextVersion,
              operation: params.operation,
            },
          },
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new InternalServerErrorException(
        'Unable to consume the persisted brand identity proposal.',
      );
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async executeConfirmedInstallOfficialWorkflowAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'install_official_workflow' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
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
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage =
        result.error ?? 'Failed to execute workflow install confirmation.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Official workflow installed.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedPublishPostAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = AgentToolName.CREATE_POST;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
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
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to publish content.';
      throw new InternalServerErrorException(errorMessage);
    }

    const totalCreated =
      typeof result.data?.totalCreated === 'number'
        ? result.data.totalCreated
        : 0;
    const scheduledAt =
      typeof result.data?.scheduledAt === 'string' &&
      result.data.scheduledAt.trim()
        ? result.data.scheduledAt.trim()
        : null;
    const createdPlatforms = Array.isArray(result.data?.createdPlatforms)
      ? (result.data.createdPlatforms as string[])
      : [];
    const platformSummary =
      createdPlatforms.length > 0 ? ` on ${createdPlatforms.join(', ')}` : '';
    const content = scheduledAt
      ? `Scheduled ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary}.`
      : `Queued ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary} for publishing.`;

    return await this.finalizeStructuredAssistantTurn({
      content,
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedGenerateMediaAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
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

    const requestedDuration = params.payload?.duration;
    if (
      requestedDuration !== undefined &&
      (typeof requestedDuration !== 'number' ||
        !Number.isFinite(requestedDuration) ||
        requestedDuration < 1 ||
        requestedDuration > 60)
    ) {
      throw new BadRequestException(
        'Video duration must be between 1 and 60 seconds.',
      );
    }

    const toolName =
      generationType === 'video'
        ? AgentToolName.GENERATE_VIDEO
        : AgentToolName.GENERATE_IMAGE;
    const requestedModel =
      typeof params.payload?.model === 'string' &&
      params.payload.model.trim().length > 0
        ? params.payload.model.trim()
        : undefined;
    const requestedPriority =
      toRouterPriority(
        typeof params.payload?.prioritize === 'string'
          ? params.payload.prioritize
          : undefined,
      ) ?? params.context.generationPriority;
    const toolPayload = {
      aspectRatio:
        typeof params.payload?.aspectRatio === 'string'
          ? params.payload.aspectRatio
          : undefined,
      duration: requestedDuration,
      prompt,
    };
    const idempotencyKey = [
      'agent-media',
      params.context.organizationId,
      params.context.userId,
      params.threadId,
      sourceActionId,
      generationType,
    ].join(':');

    return runIdempotent(this.cacheService, idempotencyKey, async () => {
      const startTime = Date.now();

      await this.threadEventRecorder.recordToolStarted({
        context: params.context,
        parameters: toolPayload,
        runId: params.context.runId,
        threadId: params.threadId,
        toolName,
      });

      const result = await this.toolExecutorService.executeTool(
        toolName,
        toolPayload,
        {
          apiKeyContext: params.context.apiKeyContext,
          authToken: params.context.authToken,
          brandId: params.context.scope?.brandId,
          generationModelOverride: requestedModel,
          generationPriority: requestedPriority,
          organizationId: params.context.organizationId,
          runId: params.context.runId,
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
        runId: params.context.runId,
        status: summary.status,
        threadId: params.threadId,
        toolName,
      });

      if (!result.success) {
        throw new InternalServerErrorException(
          result.error ?? `Failed to generate ${generationType}.`,
        );
      }

      const linkedResult = {
        ...result,
        nextActions: (result.nextActions ?? []).map((action) => ({
          ...action,
          data: {
            ...(action.data ?? {}),
            sourceGenerationActionId: sourceActionId,
          },
        })),
      };

      return await this.finalizeStructuredAssistantTurn({
        content: `${generationType === 'image' ? 'Image' : 'Video'} generated.`,
        context: params.context,
        model: params.model,
        result: linkedResult,
        threadId: params.threadId,
        toolCalls: [summary],
      });
    });
  }

  private async executeConfirmedSaveBrandVoiceProfileAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'save_brand_voice_profile' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
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
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to save brand voice.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Brand voice saved to the selected brand.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeApprovedPlanAction(
    params: {
      context: AgentChatContext;
      model: string;
      payload?: Record<string, unknown>;
      threadId: string;
    },
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
        params.context.userId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const planContent =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';
    const planId =
      typeof latestPlan?.id === 'string'
        ? latestPlan.id
        : typeof params.payload?.planId === 'string'
          ? params.payload.planId
          : 'plan';

    if (!planContent.trim()) {
      throw new BadRequestException(
        'No proposed plan is available to approve.',
      );
    }

    await this.threadEventRecorder.recordPlanUpserted({
      context: params.context,
      plan: {
        approvedAt: new Date().toISOString(),
        awaitingApproval: false,
        content: planContent,
        explanation:
          typeof latestPlan?.explanation === 'string'
            ? latestPlan.explanation
            : undefined,
        id: planId,
        lastReviewAction: 'approve',
        status: 'approved',
        steps: Array.isArray(latestPlan?.steps)
          ? (latestPlan.steps as Record<string, unknown>[])
          : undefined,
      },
      runId: params.context.runId,
      threadId: params.threadId,
    });

    const request: AgentChatRequest = {
      content: `Execute the approved plan exactly as written below. Do not regenerate a new plan unless the user explicitly asks.\n\nApproved plan:\n${planContent}`,
      model: params.model,
      source: 'agent',
      threadId: params.threadId,
    };

    return await host.executeSynchronousChatLoop({
      context: params.context,
      generationPriority:
        params.context.generationPriority ?? RouterPriority.BALANCED,
      model: params.model,
      policy: {
        allowAdvancedOverrides: false,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandId: params.context.scope?.brandId,
        creditGovernance: {
          useOrganizationPool: true,
        },
        generationModelOverride: undefined,
        generationPriority:
          params.context.generationPriority ?? RouterPriority.BALANCED,
        platform: undefined,
        qualityTier: 'balanced',
        reviewModelOverride: undefined,
        scope: params.context.scope,
        thinkingModelOverride: undefined,
      } as ResolvedAgentExecutionPolicy,
      request,
      resolvedMemories: [],
      seedTitle: '',
      systemPromptOverride: undefined,
      threadId: params.threadId,
      turnCost: await this.agentChatModelRegistry.getRoundCredits(params.model),
    });
  }

  private async executeRevisedPlanAction(
    params: {
      context: AgentChatContext;
      model: string;
      payload?: Record<string, unknown>;
      threadId: string;
    },
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
        params.context.userId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const revisionNote =
      typeof params.payload?.revisionNote === 'string'
        ? params.payload.revisionNote.trim()
        : '';
    const previousPlan =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';

    const request: AgentChatRequest = {
      content: revisionNote
        ? `Revise the current implementation plan using this feedback: ${revisionNote}`
        : 'Revise the current implementation plan and keep execution paused for review.',
      model: params.model,
      source: 'agent',
      systemPromptOverride: previousPlan
        ? `Current proposed plan:\n${previousPlan}`
        : undefined,
      threadId: params.threadId,
    };

    return await host.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request,
      resolvedMemories: [],
      reviewMetadata: {
        lastReviewAction: 'request_changes',
        revisionNote: revisionNote || undefined,
      },
      seedTitle: '',
      systemPromptOverride: request.systemPromptOverride,
      threadId: params.threadId,
      turnCost: await this.agentChatModelRegistry.getRoundCredits(params.model),
    });
  }

  private async finalizeStructuredAssistantTurn(params: {
    content: string;
    context: AgentChatContext;
    eventIdempotencyKey?: string;
    metadata?: Record<string, unknown>;
    model: string;
    result: {
      creditsUsed?: number;
      data?: Record<string, unknown>;
      nextActions?: AgentUiAction[];
      requiresConfirmation?: boolean;
      riskLevel?: 'low' | 'medium' | 'high';
    };
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<AgentChatResult> {
    let latestUiBlocks: {
      operation: AgentDashboardOperation;
      blocks?: unknown[];
      blockIds?: string[];
    } | null = null;

    const rawUiBlocks = Array.isArray(params.result.data?.uiBlocks)
      ? params.result.data.uiBlocks
      : null;
    const rawOperation =
      typeof params.result.data?.operation === 'string'
        ? (params.result.data.operation as AgentDashboardOperation)
        : null;

    if (rawUiBlocks && rawOperation) {
      const normalizedBlocks = normalizeUiBlocks(rawUiBlocks);

      latestUiBlocks = {
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
        runId: params.context.runId,
        threadId: params.threadId,
      });
    }

    const uiActions = params.result.nextActions ?? [];
    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: params.result.requiresConfirmation ?? false,
        toolCalls: params.toolCalls,
        uiActions,
      });
    const normalizedContent = normalizeFinalAssistantContent(
      sanitizeAgentOutputText(params.content),
      params.toolCalls,
      enhancedUiActions.uiActions,
    );
    const artifactMetadata = await captureRunArtifacts(
      this.agentRunsService,
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
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
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
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      idempotencyKey: params.eventIdempotencyKey,
      runId: params.context.runId,
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

  private getThreadSnapshotEffect(
    threadId: string,
    organizationId: string,
    userId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentThreadEngineService['getSnapshot']>> | null,
    unknown
  > {
    if (!this.agentThreadEngineService) {
      return Effect.succeed(null);
    }

    return this.agentThreadEngineService.getSnapshotEffect(
      threadId,
      organizationId,
      userId,
    );
  }
}
