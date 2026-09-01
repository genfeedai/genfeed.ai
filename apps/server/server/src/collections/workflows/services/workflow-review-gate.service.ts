import { randomUUID } from 'node:crypto';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/enums';
import type {
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import { BadRequestException } from '@nestjs/common';
import { WorkflowExecutionsService } from '@server/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@server/collections/workflows/schemas/workflow.schema';
import type { ReviewGateNotificationService } from '@server/collections/workflows/services/review-gate-notification.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionFinalizerService } from '@server/collections/workflows/services/workflow-execution-finalizer.service';
import { WorkflowExecutionGraphService } from '@server/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@server/collections/workflows/services/workflow-execution-progress.service';
import {
  PendingReviewGateState,
  ReviewGateApprovalResult,
  ReviewGateTimeoutResolution,
} from '@server/collections/workflows/services/workflow-executor.types';
import {
  RetiredWorkflowExecutionError,
  WorkflowExecutorDocumentService,
} from '@server/collections/workflows/services/workflow-executor-document.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';

/** Actor recorded on automatic (timeout sweep) approvals/rejections. */
const REVIEW_GATE_SYSTEM_ACTOR = 'system';

/** Registry defaults mirrored from the reviewGate node configSchema. */
const REVIEW_GATE_DEFAULT_TIMEOUT_HOURS = 24;

type ContinueWorkflowGraph = (input: {
  executionId: string;
  nodeOutputCache: Record<string, unknown>;
  startedAt: Date;
  triggerEvent: {
    data: Record<string, unknown>;
    organizationId: string;
    platform: string;
    type: string;
    userId: string;
  };
  workflow: ExecutableWorkflow;
  workflowLabel: string;
}) => Promise<ExecutionRunResult>;

type ReviewGateExecution = NonNullable<
  Awaited<ReturnType<WorkflowExecutionsService['findOne']>>
>;

type ApproveReviewGateInput = {
  workflowId: string;
  executionId: string;
  userId: string;
  nodeId: string;
  approvedAt: Date;
  approvedAtIso: string;
  pendingApproval: PendingReviewGateState;
  workflowLabel: string;
  normalizedWorkflowDoc: Parameters<
    WorkflowEngineAdapterService['convertToExecutableWorkflow']
  >[0];
  execution: ReviewGateExecution;
};

export class WorkflowReviewGateService {
  constructor(
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly documentService: WorkflowExecutorDocumentService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly finalizer: WorkflowExecutionFinalizerService,
    private readonly notifier?: ReviewGateNotificationService,
    private readonly continueWorkflowGraph?: ContinueWorkflowGraph,
  ) {}

  async submitReviewGateApproval(
    workflowId: string,
    executionId: string,
    userId: string,
    organizationId: string,
    nodeId: string,
    approved: boolean,
    rejectionReason?: string,
  ): Promise<ReviewGateApprovalResult> {
    const execution = await this.executionsService.findOne({
      id: executionId,
      organizationId: organizationId,
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const executionWorkflowId = execution.workflowId?.toString();
    if (executionWorkflowId !== workflowId) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    let normalizedWorkflowDoc: WorkflowDocument | null;
    try {
      normalizedWorkflowDoc = await this.documentService.findPinnedWorkflow(
        workflowId,
        execution.workflowVersionId,
        organizationId,
        execution.userId,
      );
    } catch (error) {
      if (error instanceof RetiredWorkflowExecutionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (!normalizedWorkflowDoc) {
      throw new NotFoundException(
        `Workflow version ${execution.workflowVersionId} not found`,
      );
    }
    const workflowLabel = this.documentService.getWorkflowLabel(
      normalizedWorkflowDoc,
    );
    const pendingApproval = this.getPendingReviewGateState(
      execution.metadata,
      nodeId,
    );

    if (!pendingApproval) {
      throw new BadRequestException(
        `No pending review gate approval found for node ${nodeId}`,
      );
    }

    if (
      execution.completedAt ||
      String(execution.status) !== WorkflowExecutionStatus.RUNNING
    ) {
      throw new BadRequestException(
        `Execution ${executionId} is not awaiting approval`,
      );
    }

    // Atomically lease the gate so a human approval and the timeout sweep can
    // never resolve it together. Failed resolvers release the lease; an
    // abandoned lease expires so a later retry can finish the same gate.
    const claimToken = randomUUID();
    const claimed = await this.executionsService.claimPendingReviewGate(
      executionId,
      nodeId,
      claimToken,
    );
    if (!claimed) {
      throw new BadRequestException(
        `Review gate for node ${nodeId} was already resolved`,
      );
    }

    const approvedAt = new Date();
    const approvedAtIso = approvedAt.toISOString();

    try {
      const result = !approved
        ? await this.rejectReviewGate({
            approvedAt,
            approvedAtIso,
            execution,
            executionId,
            keepsWorkflowActive: execution.metadata?.isSystemAction === true,
            nodeId,
            pendingApproval,
            rejectionReason,
            userId,
            workflowId,
            workflowLabel,
          })
        : await this.approveReviewGate({
            approvedAt,
            approvedAtIso,
            execution,
            executionId,
            nodeId,
            normalizedWorkflowDoc,
            pendingApproval,
            userId,
            workflowId,
            workflowLabel,
          });
      await this.executionsService.completePendingReviewGateClaim(
        executionId,
        nodeId,
        claimToken,
      );
      return result;
    } catch (error: unknown) {
      await this.executionsService
        .releasePendingReviewGateClaim(executionId, nodeId, claimToken)
        .catch(() => false);
      throw error;
    }
  }

  /**
   * Auto-resolve a review gate whose reviewer timeout has elapsed. Delegates to
   * the same approve/reject path as a human reviewer, recorded against a
   * `system` actor: auto-approves when the node opted into
   * `autoApproveIfNoResponse`, otherwise auto-rejects. Returns `null` when the
   * gate was already resolved (raced by a human) so the sweep can skip it.
   */
  async resolveTimedOutReviewGate(
    workflowId: string,
    executionId: string,
    organizationId: string,
    nodeId: string,
  ): Promise<ReviewGateTimeoutResolution | null> {
    const execution = await this.executionsService.findOne({
      id: executionId,
      organizationId: organizationId,
    });

    if (
      !execution ||
      execution.completedAt ||
      String(execution.status) !== WorkflowExecutionStatus.RUNNING
    ) {
      return null;
    }

    const pending = this.getPendingReviewGateState(execution.metadata, nodeId);
    if (!pending) {
      return null;
    }

    const approved = pending.autoApproveIfNoResponse;
    try {
      const result = await this.submitReviewGateApproval(
        workflowId,
        executionId,
        REVIEW_GATE_SYSTEM_ACTOR,
        organizationId,
        nodeId,
        approved,
        approved ? undefined : 'Review timed out with no reviewer response',
      );

      return {
        executionId,
        nodeId,
        resolution: result.status,
      };
    } catch (error: unknown) {
      // A human resolved the gate between our pre-check and the atomic claim.
      if (error instanceof BadRequestException) {
        return null;
      }
      throw error;
    }
  }

  async pauseForReviewGate(input: {
    executionId: string;
    workflow: ExecutableWorkflow;
    node: {
      id: string;
      type: string;
      label: string;
      config?: Record<string, unknown>;
    };
    inputs: Map<string, unknown>;
    completedNodes: Set<string>;
    skippedNodes: Set<string>;
    startedAt: Date;
    userId: string;
    options: {
      baselineEstimatedDurationMs?: number;
      workflowLabel: string;
    };
    nodeResults: Map<string, NodeExecutionResult>;
    totalCreditsUsed: number;
  }): Promise<ExecutionRunResult | null> {
    const rawMedia = this.extractReviewGateInput(input.inputs, 'media');
    const rawCaption = this.extractReviewGateInput(input.inputs, 'caption');
    const requestedAt = new Date().toISOString();
    const config = input.node.config ?? {};
    const pendingApproval: PendingReviewGateState = {
      autoApproveIfNoResponse: this.readBooleanConfig(
        config.autoApproveIfNoResponse,
        false,
      ),
      inputCaption: this.extractCaptionPreview(rawCaption),
      inputMedia: this.extractMediaPreview(rawMedia),
      nodeId: input.node.id,
      notifyChannels: this.readChannelsConfig(config.notifyChannels),
      notifyEmail: this.readStringConfig(config.notifyEmail),
      rawCaption,
      rawMedia,
      requestedAt,
      slackChannel: this.readStringConfig(config.slackChannel),
      timeoutHours: this.readNumberConfig(
        config.timeoutHours,
        REVIEW_GATE_DEFAULT_TIMEOUT_HOURS,
      ),
      webhookUrl: this.readStringConfig(config.webhookUrl),
    };
    const output = this.buildReviewGateNodeOutput(
      pendingApproval,
      input.executionId,
      'pending',
    );

    input.nodeResults.set(input.node.id, {
      creditsUsed: 0,
      nodeId: input.node.id,
      output,
      retryCount: 0,
      startedAt: new Date(),
      status: 'completed',
    });

    const trackedExecution = await this.progressService.trackNodeResult(
      input.executionId,
      input.node.id,
      input.node.type,
      {
        output,
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      },
    );

    await this.executionsService.updateExecutionMetadata(input.executionId, {
      pendingApproval,
    });

    // Fan out reviewer notifications for the configured channels. Failures are
    // swallowed inside the notifier so a flaky channel never blocks the pause.
    if (this.notifier && pendingApproval.notifyChannels.length > 0) {
      const { taskId } = await this.notifier.dispatchPendingNotifications(
        pendingApproval,
        {
          executionId: input.executionId,
          organizationId: input.workflow.organizationId,
          ownerUserId: input.userId,
          workflowId: input.workflow.id,
          workflowLabel: input.options.workflowLabel,
        },
      );
      if (taskId) {
        pendingApproval.taskId = taskId;
        await this.executionsService.updateExecutionMetadata(
          input.executionId,
          { pendingApproval },
        );
      }
    }

    if (input.workflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(
        input.workflow.id,
        'review-gate-pending',
        {
          approvalId: input.executionId,
          executionId: input.executionId,
          inputCaption: pendingApproval.inputCaption,
          inputMedia: pendingApproval.inputMedia,
          nodeId: input.node.id,
        },
      );
    }

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Waiting for approval: ${input.node.label}`,
        progress: trackedExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );

    return {
      completedAt: undefined,
      error: undefined,
      nodeResults: input.nodeResults,
      runId: input.executionId,
      startedAt: input.startedAt,
      status: 'running',
      totalCreditsUsed: input.totalCreditsUsed,
      workflowId: input.workflow.id,
    };
  }

  private async rejectReviewGate(input: {
    workflowId: string;
    executionId: string;
    userId: string;
    nodeId: string;
    approvedAt: Date;
    approvedAtIso: string;
    pendingApproval: PendingReviewGateState;
    rejectionReason?: string;
    keepsWorkflowActive: boolean;
    workflowLabel: string;
    execution: NonNullable<
      Awaited<ReturnType<WorkflowExecutionsService['findOne']>>
    >;
  }): Promise<ReviewGateApprovalResult> {
    const rejectionMessage = input.rejectionReason || 'Rejected by reviewer';

    await this.executionsService.updateNodeResult(input.executionId, {
      completedAt: input.approvedAt,
      error: rejectionMessage,
      nodeId: input.nodeId,
      nodeType: 'reviewGate',
      output: this.buildReviewGateNodeOutput(
        input.pendingApproval,
        input.executionId,
        'rejected',
        input.userId,
        input.approvedAtIso,
        rejectionMessage,
      ),
      status: WorkflowExecutionStatus.FAILED,
    });
    await this.executionsService.updateExecutionMetadata(input.executionId, {
      lastApproval: {
        approved: false,
        approvedAt: input.approvedAtIso,
        approvedBy: input.userId,
        nodeId: input.nodeId,
        rejectionReason: rejectionMessage,
      },
    });
    await this.notifier?.resolvePendingTask(
      input.pendingApproval.taskId,
      'rejected',
    );
    const result = this.buildReviewGateRunResult(
      input.execution,
      input.executionId,
      input.nodeId,
      'failed',
      rejectionMessage,
    );
    const completedExecution = await this.finalizer.finalizeExecution({
      completedAt: input.approvedAt,
      executionId: input.executionId,
      finalStatus: WorkflowExecutionStatus.FAILED,
      result,
      workflowId: input.workflowId,
      workflowStatus: input.keepsWorkflowActive
        ? WorkflowStatus.ACTIVE
        : WorkflowStatus.FAILED,
    });
    await this.publishTerminalReviewOutcome({
      completedExecution,
      execution: input.execution,
      finalStatus: WorkflowExecutionStatus.FAILED,
      result,
      workflowId: input.workflowId,
      workflowLabel: input.workflowLabel,
    });

    return {
      approvedAt: input.approvedAtIso,
      approvedBy: input.userId,
      executionId: input.executionId,
      nodeId: input.nodeId,
      rejectionReason: rejectionMessage,
      status: 'rejected',
    };
  }

  private async approveReviewGate(
    input: ApproveReviewGateInput,
  ): Promise<ReviewGateApprovalResult> {
    const keepsWorkflowActive =
      input.execution.metadata?.isSystemAction === true;
    const approvedOutput = this.buildReviewGateApprovedOutput(
      input.pendingApproval,
    );

    await this.executionsService.updateNodeResult(input.executionId, {
      completedAt: input.approvedAt,
      nodeId: input.nodeId,
      nodeType: 'reviewGate',
      output: this.buildReviewGateNodeOutput(
        input.pendingApproval,
        input.executionId,
        'approved',
        input.userId,
        input.approvedAtIso,
      ),
      status: WorkflowExecutionStatus.COMPLETED,
    });
    await this.executionsService.updateExecutionMetadata(input.executionId, {
      lastApproval: {
        approved: true,
        approvedAt: input.approvedAtIso,
        approvedBy: input.userId,
        nodeId: input.nodeId,
      },
    });
    await this.notifier?.resolvePendingTask(
      input.pendingApproval.taskId,
      'approved',
    );

    const { executableWorkflow, remainingNodeIds } =
      this.prepareApprovedWorkflow(input, approvedOutput);

    if (remainingNodeIds.length === 0) {
      const result = this.buildReviewGateRunResult(
        input.execution,
        input.executionId,
        input.nodeId,
        'completed',
      );
      const completedExecution = await this.finalizer.finalizeExecution({
        completedAt: input.approvedAt,
        executionId: input.executionId,
        finalStatus: WorkflowExecutionStatus.COMPLETED,
        result,
        workflowId: input.workflowId,
        workflowStatus: keepsWorkflowActive
          ? WorkflowStatus.ACTIVE
          : WorkflowStatus.COMPLETED,
      });
      await this.publishTerminalReviewOutcome({
        completedExecution,
        execution: input.execution,
        finalStatus: WorkflowExecutionStatus.COMPLETED,
        result,
        workflowId: input.workflowId,
        workflowLabel: input.workflowLabel,
      });

      return {
        approvedAt: input.approvedAtIso,
        approvedBy: input.userId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        status: 'approved',
      };
    }

    if (!this.continueWorkflowGraph) {
      throw new Error('Workflow graph continuation is unavailable');
    }

    const nodeOutputCache = Object.fromEntries(
      input.execution.nodeResults.flatMap((nodeResult) =>
        nodeResult.status === WorkflowExecutionStatus.COMPLETED &&
        nodeResult.output !== undefined
          ? [[nodeResult.nodeId, nodeResult.output] as const]
          : [],
      ),
    );
    nodeOutputCache[input.nodeId] = approvedOutput;

    const result = await this.continueWorkflowGraph({
      executionId: input.executionId,
      nodeOutputCache,
      startedAt: input.execution.startedAt ?? new Date(),
      triggerEvent: {
        data: input.execution.inputValues ?? {},
        organizationId: executableWorkflow.organizationId,
        platform: 'workflow',
        type: 'reviewGateApproval',
        userId: input.execution.userId,
      },
      workflow: executableWorkflow,
      workflowLabel: input.workflowLabel,
    });

    const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);
    if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
      const completedExecution = await this.finalizer.finalizeExecution({
        completedAt:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? new Date()
            : input.approvedAt,
        executionId: input.executionId,
        finalStatus,
        result,
        workflowId: input.workflowId,
        workflowStatus: keepsWorkflowActive
          ? WorkflowStatus.ACTIVE
          : finalStatus === WorkflowExecutionStatus.COMPLETED
            ? WorkflowStatus.COMPLETED
            : WorkflowStatus.FAILED,
      });
      await this.publishTerminalReviewOutcome({
        completedExecution,
        execution: input.execution,
        finalStatus,
        result,
        workflowId: input.workflowId,
        workflowLabel: input.workflowLabel,
      });
    }

    return {
      approvedAt: input.approvedAtIso,
      approvedBy: input.userId,
      executionId: input.executionId,
      nodeId: input.nodeId,
      status: 'approved',
    };
  }

  private prepareApprovedWorkflow(
    input: ApproveReviewGateInput,
    approvedOutput: Record<string, unknown>,
  ): { executableWorkflow: ExecutableWorkflow; remainingNodeIds: string[] } {
    let executableWorkflow = this.engineAdapter.convertToExecutableWorkflow(
      input.normalizedWorkflowDoc,
    );
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      input.normalizedWorkflowDoc,
      executableWorkflow,
      input.execution.inputValues ?? {},
    );

    for (const node of executableWorkflow.nodes) {
      if (node.id === input.nodeId) {
        node.cachedOutput = approvedOutput;
        continue;
      }
      const nodeResult = input.execution.nodeResults.find(
        (result) =>
          result.nodeId === node.id &&
          result.status === WorkflowExecutionStatus.COMPLETED &&
          result.output !== undefined,
      );
      if (nodeResult?.output !== undefined) {
        node.cachedOutput = nodeResult.output;
      }
    }

    const remainingNodeIds = this.graphService
      .collectDownstreamNodeIds(
        input.nodeId,
        executableWorkflow.edges,
        executableWorkflow.nodes,
      )
      .filter(
        (downstreamNodeId) =>
          !input.execution.nodeResults.some(
            (result) =>
              result.nodeId === downstreamNodeId &&
              result.status === WorkflowExecutionStatus.COMPLETED,
          ),
      );
    return { executableWorkflow, remainingNodeIds };
  }

  private buildReviewGateRunResult(
    execution: NonNullable<
      Awaited<ReturnType<WorkflowExecutionsService['findOne']>>
    >,
    executionId: string,
    nodeId: string,
    status: 'completed' | 'failed',
    error?: string,
  ): ExecutionRunResult {
    const completedAt = new Date();
    return {
      completedAt,
      ...(error ? { error } : {}),
      nodeResults: new Map([
        [
          nodeId,
          {
            completedAt,
            creditsUsed: 0,
            ...(error ? { error } : {}),
            nodeId,
            retryCount: 0,
            startedAt: completedAt,
            status,
          },
        ],
      ]),
      runId: executionId,
      startedAt: execution.startedAt ?? completedAt,
      status,
      totalCreditsUsed:
        typeof execution.creditsUsed === 'number' ? execution.creditsUsed : 0,
      workflowId: String(execution.workflowId),
    };
  }

  private async publishTerminalReviewOutcome(input: {
    completedExecution: Awaited<
      ReturnType<WorkflowExecutionFinalizerService['finalizeExecution']>
    >;
    execution: NonNullable<
      Awaited<ReturnType<WorkflowExecutionsService['findOne']>>
    >;
    finalStatus: WorkflowExecutionStatus;
    result: ExecutionRunResult;
    workflowId: string;
    workflowLabel: string;
  }): Promise<void> {
    const status =
      input.finalStatus === WorkflowExecutionStatus.COMPLETED
        ? 'completed'
        : 'failed';
    this.progressService.clearEtaPlan(input.execution.id);
    await this.progressService.publishWorkflowStatus(
      input.workflowId,
      status,
      input.execution.userId,
      {
        error: input.result.error,
        workflowLabel: input.workflowLabel,
      },
    );
    await this.progressService.publishWorkflowTaskUpdate({
      error: input.result.error,
      eta: this.progressService.extractEtaFromMetadata(
        input.completedExecution?.metadata,
      ),
      executionId: input.execution.id,
      progress: 100,
      resultId: input.execution.id,
      status,
      userId: input.execution.userId,
      workflowId: input.workflowId,
      workflowLabel: input.workflowLabel,
    });
  }

  private getPendingReviewGateState(
    metadata: Record<string, unknown> | undefined,
    nodeId: string,
  ): PendingReviewGateState | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const pendingApproval = metadata.pendingApproval;
    if (!pendingApproval || typeof pendingApproval !== 'object') {
      return null;
    }

    const state = pendingApproval as Record<string, unknown>;
    if (state.nodeId !== nodeId) {
      return null;
    }

    return {
      autoApproveIfNoResponse: this.readBooleanConfig(
        state.autoApproveIfNoResponse,
        false,
      ),
      inputCaption:
        typeof state.inputCaption === 'string' ? state.inputCaption : null,
      inputMedia:
        typeof state.inputMedia === 'string' ? state.inputMedia : null,
      nodeId,
      notifyChannels: this.readChannelsConfig(state.notifyChannels),
      notifyEmail: this.readStringConfig(state.notifyEmail),
      rawCaption: state.rawCaption,
      rawMedia: state.rawMedia,
      requestedAt:
        typeof state.requestedAt === 'string'
          ? state.requestedAt
          : new Date().toISOString(),
      slackChannel: this.readStringConfig(state.slackChannel),
      taskId: this.readStringConfig(state.taskId),
      timeoutHours: this.readNumberConfig(
        state.timeoutHours,
        REVIEW_GATE_DEFAULT_TIMEOUT_HOURS,
      ),
      webhookUrl: this.readStringConfig(state.webhookUrl),
    };
  }

  private readStringConfig(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readBooleanConfig(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private readNumberConfig(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return fallback;
  }

  private readChannelsConfig(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (channel): channel is string =>
        typeof channel === 'string' && channel.length > 0,
    );
  }

  private buildReviewGateNodeOutput(
    pendingApproval: PendingReviewGateState,
    approvalId: string,
    approvalStatus: 'approved' | 'pending' | 'rejected',
    approvedBy?: string,
    approvedAt?: string,
    rejectionReason?: string,
  ): Record<string, unknown> {
    return {
      approvalId,
      approvalStatus,
      approvedAt: approvedAt ?? null,
      approvedBy: approvedBy ?? null,
      inputCaption: pendingApproval.inputCaption,
      inputMedia: pendingApproval.inputMedia,
      outputCaption:
        approvalStatus === 'approved'
          ? (pendingApproval.rawCaption ?? null)
          : null,
      outputMedia:
        approvalStatus === 'approved'
          ? (pendingApproval.rawMedia ?? null)
          : null,
      rejectionReason: rejectionReason ?? null,
    };
  }

  private buildReviewGateApprovedOutput(
    pendingApproval: PendingReviewGateState,
  ): Record<string, unknown> {
    return {
      caption: pendingApproval.rawCaption,
      media: pendingApproval.rawMedia,
    };
  }

  private extractMediaPreview(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'string') {
        return candidate;
      }
    }

    return null;
  }

  private extractCaptionPreview(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private extractReviewGateInput(
    inputs: Map<string, unknown>,
    kind: 'caption' | 'media',
  ): unknown {
    const directValue = inputs.get(kind);
    if (directValue !== undefined) {
      return directValue;
    }

    for (const value of inputs.values()) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const record = value as Record<string, unknown>;
      if (kind === 'caption') {
        if (typeof record.caption === 'string') {
          return record.caption;
        }
        if (typeof record.text === 'string') {
          return record.text;
        }
        continue;
      }

      if (record.media !== undefined) {
        return record.media;
      }
      for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
        if (record[key] !== undefined) {
          return record[key];
        }
      }
    }

    return undefined;
  }
}
