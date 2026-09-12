import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import type { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import type { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  hasTrustedMutationApproval,
  specializedConfirmationTool,
} from '@api/services/agent-orchestrator/tools/agent-tool-mutation-approval.util';
import type { AgentMutationAuthorization } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-policy.types';
import { buildMutationApprovalCard } from '@api/services/agent-orchestrator/tools/mutation-approval-card';
import type {
  AgentThreadModeValue,
  CuratedActionName,
} from '@genfeedai/actions';
import {
  buildLogicalWriteKey,
  evaluateMutationPolicy,
  getToolByName,
  resolveEffectiveMutationPolicy,
  VISUAL_GENERATION_REVIEW_TOOL_NAMES,
} from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus } from '@genfeedai/prisma';
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
  ) {}

  /**
   * Resolves the thread's #4672 agent mode, or `undefined` when this call has
   * no thread at all — MCP, CLI, a recurring task, a system-triggered batch.
   * Those keep today's declared policy untouched
   * (`resolveEffectiveMutationPolicy` treats `undefined` that way); #4672
   * modes are a per-*thread* concept and do not apply outside one.
   *
   * `context.agentMode` wins when a caller already knows it (thread UI
   * actions, tests). A call that DOES have a thread but could not resolve its
   * mode (storage unavailable, corrupt value) fails safe to Manual rather
   * than returning `undefined` — only "no thread" skips the matrix, never "a
   * thread whose mode we failed to read."
   */
  async resolveAgentModeForContext(
    context: ToolExecutionContext,
  ): Promise<AgentThreadModeValue | undefined> {
    if (context.agentMode) {
      return context.agentMode;
    }
    if (!context.threadId) {
      return undefined;
    }
    if (this.agentThreadsService) {
      const thread = await this.agentThreadsService.findOne({
        id: context.threadId,
        organizationId: context.organizationId,
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
    if (
      isAvailableOnSurface &&
      !context.approvedApprovalId &&
      effectivePolicy !== 'approval-required'
    ) {
      return { kind: 'execute' };
    }

    if (isAvailableOnSurface && !context.approvedApprovalId) {
      const isVisualGenerationReview =
        VISUAL_GENERATION_REVIEW_TOOL_NAMES.has(toolName);
      const specialized =
        isVisualGenerationReview ||
        specializedConfirmationTool(toolName, parameters);
      if (specialized && context.confirmationOrigin === 'thread-ui-action') {
        return { kind: 'execute' };
      }
      if (specialized) {
        const previewContext = {
          ...context,
          confirmationOrigin: undefined,
          approvedApprovalId: undefined,
        };
        const result = isVisualGenerationReview
          ? await collaborators.prepareHandler.prepareGeneration(
              {
                ...parameters,
                generationType:
                  toolName === 'generate_image' ? 'image' : 'video',
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
    }

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

    return {
      kind: 'return',
      result: {
        approvalId: approval?.id,
        approvalStatus: 'pending',
        creditsUsed: 0,
        data: {
          approvalId: approval?.id,
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
