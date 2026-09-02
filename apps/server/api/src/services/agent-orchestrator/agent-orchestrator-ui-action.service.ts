import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentScopeContextService } from '@api/index';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  AgentOrchestratorUiActionHost,
  ThreadUiActionExecutionParams,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionBrandIdentityService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-brand-identity.service';
import { AgentOrchestratorUiActionConfirmedToolService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { rethrowUiActionError } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-error';
import {
  isSupportedThreadUiAction,
  resolveThreadUiActionFamily,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-family';
import { AgentOrchestratorUiActionPlanService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatResult,
  AgentThreadUiActionRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { withAgentScopeResult } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  AgentRuntimeSessionService,
  getRuntimeBindingEffect,
} from '@api/services/agent-threading/services/agent-runtime-session.service';
import { CacheService } from '@api/services/cache/cache.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';

export type { AgentOrchestratorUiActionHost } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';

@Injectable()
export class AgentOrchestratorUiActionService {
  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly cacheService: CacheService,
    private readonly brandIdentityActions: AgentOrchestratorUiActionBrandIdentityService,
    private readonly confirmedToolActions: AgentOrchestratorUiActionConfirmedToolService,
    private readonly planActions: AgentOrchestratorUiActionPlanService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
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
    if (resolveThreadUiActionFamily(request.action) !== 'brand-identity') {
      return execute();
    }
    const sourceActionId = this.brandIdentityActions.readRequiredSourceActionId(
      request.payload,
    );
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
    await this.assertThreadIsActive(threadId, context.organizationId);
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

    return host.runInThreadLane(threadId, async () => {
      const scope = await this.resolveUiActionScopeInsideLane({
        basePolicyBrandId: basePolicy.brandId,
        context,
        request,
        threadId,
      });
      const scopedContext = {
        ...context,
        generationPriority: basePolicy.generationPriority,
        scope,
      };
      await this.recordActionStarted({
        actionContent,
        context: scopedContext,
        model,
        threadId,
      });
      try {
        return await this.dispatchAction(
          request,
          scopedContext,
          model,
          threadId,
          scope,
          host,
        );
      } catch (error: unknown) {
        await this.threadEventRecorder.recordRunFailed({
          context: scopedContext,
          error:
            error instanceof Error
              ? error.message
              : `Thread UI action failed: ${request.action}`,
          runId: scopedContext.executionId,
          threadId,
        });
        rethrowUiActionError(error);
      }
    });
  }

  private async dispatchAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
    model: string,
    threadId: string,
    scope: ValidatedAgentScope,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    if (!isSupportedThreadUiAction(request.action)) {
      throw new BadRequestException(
        `Unsupported thread UI action: ${request.action}`,
      );
    }
    const action = request.action;
    const params: ThreadUiActionExecutionParams = {
      context,
      model,
      payload: request.payload,
      threadId,
    };
    switch (action) {
      case 'approve_plan':
      case 'revise_plan':
        return withAgentScopeResult(
          await this.planActions.execute(action, params, host),
          scope,
        );
      case 'confirm_create_brand':
      case 'confirm_rename_brand': {
        const confirmed = await this.brandIdentityActions.execute(
          action === 'confirm_create_brand' ? 'create' : 'rename',
          params,
        );
        return withAgentScopeResult(confirmed.result, confirmed.scope);
      }
      case 'confirm_install_official_workflow':
      case 'confirm_agent_transfer':
      case 'confirm_publish_post':
      case 'confirm_generate_media':
      case 'confirm_save_brand_voice_profile':
        return withAgentScopeResult(
          await this.confirmedToolActions.execute(action, params),
          scope,
        );
      default: {
        const exhaustiveAction: never = action;
        throw new BadRequestException(
          `Unsupported thread UI action: ${exhaustiveAction}`,
        );
      }
    }
  }

  private async recordActionStarted(params: {
    actionContent: string;
    context: AgentChatContext;
    model: string;
    threadId: string;
  }): Promise<void> {
    await this.threadEventRecorder.recordThreadTurnRequested({
      content: params.actionContent,
      context: params.context,
      model: params.model,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordThreadTurnStarted({
      context: params.context,
      model: params.model,
      runId: params.context.executionId,
      threadId: params.threadId,
    });
  }

  private async assertThreadIsActive(
    threadId: string,
    organizationId: string,
  ): Promise<void> {
    const threadRecord = await this.agentThreadsService.findOne({
      id: threadId,
      organizationId,
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
  }

  private async resolveUiActionScopeInsideLane(params: {
    basePolicyBrandId?: string;
    context: AgentChatContext;
    request: AgentThreadUiActionRequest;
    threadId: string;
  }): Promise<ValidatedAgentScope> {
    const isBrandConfirmation =
      resolveThreadUiActionFamily(params.request.action) === 'brand-identity';
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
    if (!preparedScope.existingScope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }
    await this.agentScopeContextService.assertConsequentialBoundary(
      preparedScope.existingScope,
      'tool',
    );
    return preparedScope.existingScope;
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
      organizationId,
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
      return `Confirmed ${payload?.generationType === 'video' ? 'video' : 'image'} generation.`;
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
}
