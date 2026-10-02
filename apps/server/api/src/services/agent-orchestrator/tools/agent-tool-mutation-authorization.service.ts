import { getActionOriginContext } from '@api/action-origin/action-origin.context';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { AGENT_RUNTIME_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import { readPublishContentId } from '@api/services/agent-orchestrator/tools/agent-publish-mcp-draft-only.util';
import type { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  hasTrustedMutationApproval,
  specializedConfirmationTool,
} from '@api/services/agent-orchestrator/tools/agent-tool-mutation-approval.util';
import type { AgentMutationAuthorization } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-policy.types';
import { buildMutationApprovalCard } from '@api/services/agent-orchestrator/tools/mutation-approval-card';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AgentThreadModeValue,
  CuratedActionName,
} from '@genfeedai/actions';
import {
  evaluateMutationPolicy,
  getToolByName,
  resolveEffectiveMutationPolicy,
  VISUAL_GENERATION_REVIEW_TOOL_NAMES,
} from '@genfeedai/actions';
import { buildLogicalWriteKey } from '@genfeedai/actions/server';
import {
  ActionOrigin,
  AgentAutonomyMode,
  normalizeAgentAutonomyMode,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import {
  McpApprovalStatus,
  Prisma,
  WorkflowExecutionStatus,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

/**
 * Handlers `AgentToolExecutorService` already owns that the mutation-policy
 * decision needs at call time. Passed in per call (rather than injected here)
 * so this service never depends on the executor's own dispatch table — that
 * would be a circular dependency back to the class it was extracted from.
 */
export type AgentMutationPolicyCollaborators = {
  prepareHandler: AgentPrepareToolHandler;
  publishHandler: AgentPublishToolHandler;
  routeRewriteService: AgentRouteRewriteService;
  dispatchPreview: (
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<AgentToolResult>;
};

/**
 * #4672 — per-thread agent-mode resolution and the mutation approval
 * lifecycle (pending / claimed / recorded), split out of
 * `AgentToolExecutorService` to keep that class's constructor and file size
 * within the `check:runtime-complexity` guard.
 */
@Injectable()
export class AgentToolMutationAuthorizationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly mcpApprovalsService?: McpApprovalsService,
    @Optional()
    private readonly agentThreadsService?: AgentThreadsService,
    @Optional()
    private readonly prisma?: PrismaService,
  ) {}

  /**
   * Resolves the thread's #4672 agent mode, or `undefined` when this call has
   * no thread at all — MCP, CLI, a recurring task, a system-triggered batch.
   * Those keep today's declared policy untouched
   * (`resolveEffectiveMutationPolicy` treats `undefined` that way); #4672
   * modes are a per-*thread* concept and do not apply outside one.
   *
   * Caller-provided modes are ignored. A call that has a thread but cannot resolve its
   * mode (storage unavailable, corrupt value) fails safe to Manual rather
   * than returning `undefined` — only "no thread" skips the matrix, never "a
   * thread whose mode we failed to read."
   */
  async resolveAgentModeForContext(
    context: ToolExecutionContext,
  ): Promise<AgentThreadModeValue | undefined> {
    if (!context.threadId) {
      return undefined;
    }
    if (this.agentThreadsService) {
      const thread = await this.agentThreadsService.findOne({
        id: context.threadId,
        organizationId: context.organizationId,
        userId: context.userId,
        isDeleted: false,
      });
      const mode = (thread as { mode?: unknown } | null)?.mode;
      if (mode === 'auto' || mode === 'manual' || mode === 'plan') {
        return mode;
      }
    }
    return 'manual';
  }

  async authorize(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    collaborators: AgentMutationPolicyCollaborators,
  ): Promise<AgentMutationAuthorization> {
    const definition = getToolByName(toolName);
    const isAvailableOnSurface = Boolean(
      definition?.surfaces.agent || definition?.surfaces.mcp,
    );
    const agentMode = await this.resolveAgentModeForContext(context);
    const effectivePolicy = resolveEffectiveMutationPolicy(
      toolName,
      agentMode,
      definition?.mutationPolicy,
    );
    const proactiveDraft = await this.resolveProactiveTextDraftConstraint(
      toolName,
      parameters,
      context,
    );
    if (proactiveDraft) return proactiveDraft;
    if (
      isAvailableOnSurface &&
      !context.approvedApprovalId &&
      effectivePolicy !== 'approval-required'
    ) {
      return { kind: 'execute' };
    }

    if (isAvailableOnSurface && !context.approvedApprovalId) {
      const preview = await this.resolveSpecializedPreview(
        toolName,
        parameters,
        context,
        collaborators,
      );
      if (preview) {
        return preview;
      }
    }

    return this.resolveApprovalDecision(
      toolName,
      parameters,
      context,
      effectivePolicy,
      isAvailableOnSurface,
    );
  }

  private async resolveProactiveTextDraftConstraint(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentMutationAuthorization | null> {
    if (
      toolName !== 'create_post' ||
      !context.isProactive ||
      context.autonomyMode !== AgentAutonomyMode.SUPERVISED ||
      context.approvedApprovalId ||
      context.confirmationOrigin ||
      readPublishContentId(parameters) ||
      getActionOriginContext().origin !== ActionOrigin.AGENT
    )
      return null;
    const denied: AgentMutationAuthorization = {
      kind: 'return',
      result: {
        success: false,
        creditsUsed: 0,
        error: 'Proactive text drafts require a trusted supervised execution.',
      },
    };
    const scope = context.validatedScope;
    if (
      !context.runId ||
      !context.strategyId ||
      !context.threadId ||
      !scope?.brandId ||
      scope.organizationId !== context.organizationId ||
      scope.userId !== context.userId ||
      scope.threadId !== context.threadId ||
      (context.brandId !== undefined && context.brandId !== scope.brandId)
    )
      return denied;
    if (!this.prisma)
      throw new Error('Proactive draft authorization storage is unavailable.');
    const trusted = await this.prisma.$transaction(
      (tx) => this.hasTrustedProactiveDraftSnapshot(tx, context),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return trusted
      ? { kind: 'execute', constraint: 'proactive-text-draft-only' }
      : denied;
  }

  private async hasTrustedProactiveDraftSnapshot(
    tx: Prisma.TransactionClient,
    context: ToolExecutionContext,
  ): Promise<boolean> {
    const [execution, thread, strategy] = await Promise.all([
      tx.workflowExecution.findFirst({
        where: {
          id: context.runId,
          organizationId: context.organizationId,
          userId: context.userId,
          isDeleted: false,
          status: WorkflowExecutionStatus.RUNNING,
        },
        select: {
          result: true,
          workflowId: true,
          workflowVersionId: true,
          workflow: {
            select: {
              id: true,
              organizationId: true,
              userId: true,
              isDeleted: true,
              metadata: true,
            },
          },
          workflowVersion: {
            select: { workflowId: true, organizationId: true, userId: true },
          },
        },
      }),
      tx.agentThread.findFirst({
        where: {
          id: context.threadId,
          organizationId: context.organizationId,
          userId: context.userId,
          isDeleted: false,
        },
        select: {
          brandId: true,
          agentStrategyId: true,
          contextVersion: true,
          status: true,
          mode: true,
        },
      }),
      tx.agentStrategy.findFirst({
        where: {
          id: context.strategyId,
          organizationId: context.organizationId,
          userId: context.userId,
          brandId: context.validatedScope?.brandId,
          isDeleted: false,
          isActive: true,
          organization: { isDeleted: false },
          brand: { organizationId: context.organizationId, isDeleted: false },
        },
        select: { config: true },
      }),
    ]);
    if (!execution || !thread || !strategy) return false;
    const workflow = execution.workflow;
    const version = execution.workflowVersion;
    const config = this.readProactiveDraftRecord(strategy.config);
    const mode = config?.autonomyMode;
    return Boolean(
      config &&
        config.isEnabled !== false &&
        (mode === undefined ||
          (typeof mode === 'string' &&
            Object.values(AgentAutonomyMode).some(
              (value) => value === mode.trim().toUpperCase(),
            ))) &&
        normalizeAgentAutonomyMode(mode) === AgentAutonomyMode.SUPERVISED &&
        thread.brandId === context.validatedScope?.brandId &&
        thread.agentStrategyId === context.strategyId &&
        thread.contextVersion === context.validatedScope?.contextVersion &&
        thread.status?.toLowerCase() !== 'archived' &&
        (thread.mode === 'manual' || thread.mode === 'auto') &&
        !workflow.isDeleted &&
        workflow.id === execution.workflowId &&
        workflow.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
        workflow.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
        isHiddenSystemWorkflowMetadata(workflow.metadata) &&
        getSystemWorkflowMetadata(workflow.metadata)?.canonicalId ===
          AGENT_RUNTIME_WORKFLOW_IDS.TURN &&
        version.workflowId === execution.workflowId &&
        version.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
        version.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
        this.hasTrustedProactiveDraftEnvelope(execution.result, context),
    );
  }

  private hasTrustedProactiveDraftEnvelope(
    result: unknown,
    context: ToolExecutionContext,
  ): boolean {
    const envelope = this.readProactiveDraftRecord(result);
    const inputs = this.readProactiveDraftRecord(envelope?.inputValues);
    const request = this.readProactiveDraftRecord(inputs?.request);
    const metadata = this.readProactiveDraftRecord(envelope?.metadata);
    return Boolean(
      request &&
        metadata &&
        request.source === 'proactive' &&
        request.strategyId === context.strategyId &&
        request.threadId === context.threadId &&
        request.brandId === context.validatedScope?.brandId &&
        request.autonomyMode === AgentAutonomyMode.SUPERVISED &&
        typeof request.creditBudget === 'number' &&
        Number.isFinite(request.creditBudget) &&
        request.creditBudget > 0 &&
        metadata.source === 'proactive' &&
        metadata.isSystemAction === true &&
        metadata.canonicalId === AGENT_RUNTIME_WORKFLOW_IDS.TURN &&
        metadata.actionType === AGENT_RUNTIME_WORKFLOW_IDS.TURN &&
        metadata.strategyId === context.strategyId &&
        metadata.threadId === context.threadId &&
        metadata.brandId === context.validatedScope?.brandId,
    );
  }

  private readProactiveDraftRecord(
    value: unknown,
  ): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  /**
   * The "Generate"/"Post" review-card preview path: a specialized confirmation
   * tool renders its own preview card instead of the generic pending-approval
   * card, and a confirmed click (`confirmationOrigin: 'thread-ui-action'`)
   * bypasses the gate it itself triggered. Returns `null` when `toolName`
   * isn't a specialized confirmation tool, so the caller falls through to the
   * generic approval-record decision.
   */
  private async resolveSpecializedPreview(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    collaborators: AgentMutationPolicyCollaborators,
  ): Promise<AgentMutationAuthorization | null> {
    const isVisualGenerationReview =
      VISUAL_GENERATION_REVIEW_TOOL_NAMES.has(toolName);
    const specialized =
      isVisualGenerationReview ||
      specializedConfirmationTool(toolName, parameters);
    if (!specialized) {
      return null;
    }
    if (context.confirmationOrigin === 'thread-ui-action') {
      return { kind: 'execute' };
    }

    const previewContext = {
      ...context,
      confirmationOrigin: undefined,
      approvedApprovalId: undefined,
    };
    const result = isVisualGenerationReview
      ? await collaborators.prepareHandler.prepareGeneration(
          {
            ...parameters,
            generationType: toolName === 'generate_image' ? 'image' : 'video',
          },
          previewContext,
        )
      : toolName === 'create_post'
        ? await collaborators.publishHandler.preparePost(
            parameters,
            previewContext,
          )
        : await collaborators.dispatchPreview(
            toolName,
            { ...parameters, confirmed: false },
            previewContext,
          );
    return {
      kind: 'return',
      result: await collaborators.routeRewriteService.scopeToolResultHrefs(
        result,
        context,
      ),
    };
  }

  /**
   * The generic approval-record path: looks up (or reconciles) an existing
   * MCP approval for this exact logical write and turns it into an execute /
   * replay / reject / create-pending outcome.
   */
  private async resolveApprovalDecision(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    effectivePolicy: ReturnType<typeof resolveEffectiveMutationPolicy>,
    isAvailableOnSurface: boolean,
  ): Promise<AgentMutationAuthorization> {
    const idempotencyKey = buildLogicalWriteKey({
      arguments: parameters,
      organizationId: context.organizationId,
      threadId: context.threadId,
      scope: context.validatedScope,
      toolName,
      userId: context.userId,
    });
    const existing =
      context.approvedApprovalId && this.mcpApprovalsService
        ? await this.mcpApprovalsService.findOwned(
            context.approvedApprovalId,
            context.organizationId,
          )
        : this.mcpApprovalsService
          ? await this.mcpApprovalsService.findActiveByIdempotencyKey(
              context.organizationId,
              idempotencyKey,
            )
          : null;
    const hasTrustedApproval = hasTrustedMutationApproval(
      toolName,
      parameters,
      context,
      existing,
    );
    const decision = evaluateMutationPolicy({
      existing: existing
        ? {
            result: (existing.result as Record<string, unknown> | null) ?? null,
            status: existing.status as 'APPROVED' | 'DECLINED' | 'PENDING',
          }
        : undefined,
      hasTrustedApproval,
      hostSupportsApproval: context.hostSupportsApproval,
      isAvailableOnSurface,
      policy: effectivePolicy,
    });

    if (decision.kind === 'execute') {
      if (effectivePolicy !== 'approval-required') {
        return { kind: 'execute' };
      }
      return this.claimApprovedMutation(
        toolName,
        parameters,
        context,
        existing,
      );
    }

    if (decision.kind === 'replay') {
      if (
        typeof decision.result.success !== 'boolean' ||
        typeof decision.result.creditsUsed !== 'number'
      ) {
        throw new Error('Stored approval result is not a valid agent result');
      }
      return {
        kind: 'return',
        result: {
          ...decision.result,
          approvalId: existing?.id,
          approvalStatus: 'approved',
          creditsUsed: 0,
          mutationPolicy: 'approval-required',
          success: decision.result.success,
        },
      };
    }

    if (decision.kind === 'reject') {
      return {
        kind: 'return',
        result: {
          creditsUsed: 0,
          error: decision.error,
          mutationPolicy: effectivePolicy,
          success: false,
        },
      };
    }

    return this.createMutationApproval(toolName, parameters, context);
  }

  private async createMutationApproval(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<AgentMutationAuthorization> {
    if (!this.mcpApprovalsService) {
      throw new Error(
        'Approval service unavailable. Please retry when approval storage is available.',
      );
    }
    const approval = await this.mcpApprovalsService.createPending(
      context.organizationId,
      context.userId,
      toolName,
      parameters,
      { threadId: context.threadId, scope: context.validatedScope },
    );
    if (!approval?.id) {
      throw new Error('Approval storage did not return a pending approval id');
    }

    return {
      kind: 'return',
      result: {
        approvalId: approval.id,
        approvalStatus: 'pending',
        creditsUsed: 0,
        data: {
          approvalId: approval.id,
          mutationPolicy: 'approval-required',
          status: 'pending',
          toolName,
        },
        mutationPolicy: 'approval-required',
        requiresConfirmation: true,
        nextActions: [
          buildMutationApprovalCard(approval.id, toolName, parameters, context),
        ],
        success: true,
      },
    };
  }

  private async claimApprovedMutation(
    toolName: CuratedActionName,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    existing: McpApprovalDocument | null,
  ): Promise<AgentMutationAuthorization> {
    if (!this.mcpApprovalsService)
      throw new Error('Approval service unavailable');
    const approval =
      existing ??
      (await this.mcpApprovalsService.createPending(
        context.organizationId,
        context.userId,
        toolName,
        parameters,
        { threadId: context.threadId, scope: context.validatedScope },
      ));
    if (approval.status === McpApprovalStatus.PENDING) {
      await this.mcpApprovalsService.resolve(
        approval.id,
        context.organizationId,
        'approve',
        undefined,
        context.apiKeyContext,
      );
    }
    if (
      !(await this.mcpApprovalsService.claimExecution(
        approval.id,
        context.organizationId,
      ))
    ) {
      throw new Error(
        'Approved mutation is already executing or awaiting outcome reconciliation',
      );
    }
    return { kind: 'execute', approvalId: approval.id };
  }

  async recordApprovedMutationResult(
    approvalId: string | undefined,
    organizationId: string,
    result: AgentToolResult,
  ): Promise<void> {
    if (!approvalId || !this.mcpApprovalsService) return;
    const serializedResult = toPlainJson({ ...result });
    try {
      await this.mcpApprovalsService.attachResult(
        approvalId,
        organizationId,
        serializedResult,
      );
    } catch {
      // Retry the same outcome once. Retain the claim if both writes fail:
      // replaying a completed mutation is unsafe without downstream idempotency.
      try {
        await this.mcpApprovalsService.attachResult(
          approvalId,
          organizationId,
          serializedResult,
        );
      } catch (error: unknown) {
        this.loggerService.error(
          `Approved mutation result persistence failed for approval ${approvalId} in organization ${organizationId}; outcome reconciliation required`,
          this.constructorName,
        );
        throw error;
      }
    }
  }
}
