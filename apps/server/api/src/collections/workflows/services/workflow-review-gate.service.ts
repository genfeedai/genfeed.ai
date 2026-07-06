import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionFinalizerService } from '@api/collections/workflows/services/workflow-execution-finalizer.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import { EXECUTABLE_WORKFLOW_SELECT } from '@api/collections/workflows/services/workflow-executor.constants';
import {
  PendingReviewGateState,
  ReviewGateApprovalResult,
} from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutorDocumentService } from '@api/collections/workflows/services/workflow-executor-document.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/enums';
import type {
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
} from '@genfeedai/workflow-engine';
import { BadRequestException } from '@nestjs/common';

export class WorkflowReviewGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly documentService: WorkflowExecutorDocumentService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly finalizer: WorkflowExecutionFinalizerService,
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
      _id: executionId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const executionWorkflowId = execution.workflowId?.toString();
    if (executionWorkflowId !== workflowId) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const workflowDoc = await findOrThrow(
      this.prisma.workflow,
      {
        select: EXECUTABLE_WORKFLOW_SELECT,
        where: { id: workflowId, isDeleted: false, organizationId },
      },
      'Workflow',
      workflowId,
    );

    const normalizedWorkflowDoc =
      this.documentService.normalizeWorkflowDocument(workflowDoc);
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

    const approvedAt = new Date();
    const approvedAtIso = approvedAt.toISOString();

    if (!approved) {
      return this.rejectReviewGate({
        approvedAt,
        approvedAtIso,
        executionId,
        nodeId,
        pendingApproval,
        rejectionReason,
        userId,
        workflowId,
      });
    }

    return this.approveReviewGate({
      approvedAt,
      approvedAtIso,
      execution,
      executionId,
      nodeId,
      pendingApproval,
      userId,
      workflowId,
      workflowLabel,
      normalizedWorkflowDoc,
    });
  }

  async pauseForReviewGate(input: {
    executionId: string;
    workflow: ExecutableWorkflow;
    node: { id: string; type: string; label: string };
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
    const pendingApproval: PendingReviewGateState = {
      inputCaption: this.extractCaptionPreview(rawCaption),
      inputMedia: this.extractMediaPreview(rawMedia),
      nodeId: input.node.id,
      rawCaption,
      rawMedia,
      requestedAt,
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
    await this.executionsService.setFailedNodeId(
      input.executionId,
      input.nodeId,
    );
    await this.executionsService.updateExecutionMetadata(input.executionId, {
      lastApproval: {
        approved: false,
        approvedAt: input.approvedAtIso,
        approvedBy: input.userId,
        nodeId: input.nodeId,
        rejectionReason: rejectionMessage,
      },
      pendingApproval: null,
    });
    await this.executionsService.completeExecution(
      input.executionId,
      rejectionMessage,
    );
    await this.prisma.workflow.update({
      data: {
        completedAt: input.approvedAt,
        status: WorkflowStatus.FAILED,
      },
      where: { id: input.workflowId },
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

  private async approveReviewGate(input: {
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
    execution: NonNullable<
      Awaited<ReturnType<WorkflowExecutionsService['findOne']>>
    >;
  }): Promise<ReviewGateApprovalResult> {
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
      pendingApproval: null,
    });

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

    const downstreamNodeIds = this.graphService.collectDownstreamNodeIds(
      input.nodeId,
      executableWorkflow.edges,
      executableWorkflow.nodes,
    );
    const remainingNodeIds = downstreamNodeIds.filter(
      (downstreamNodeId) =>
        !input.execution.nodeResults.some(
          (result) =>
            result.nodeId === downstreamNodeId &&
            result.status === WorkflowExecutionStatus.COMPLETED,
        ),
    );

    if (remainingNodeIds.length === 0) {
      await this.executionsService.completeExecution(input.executionId);
      await this.prisma.workflow.update({
        data: {
          completedAt: input.approvedAt,
          status: WorkflowStatus.COMPLETED,
        },
        where: { id: input.workflowId },
      });

      return {
        approvedAt: input.approvedAtIso,
        approvedBy: input.userId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        status: 'approved',
      };
    }

    const baselineEstimatedDurationMs =
      this.progressService.extractEstimatedDurationMs(input.execution.metadata);
    const completedNodeIds = new Set(
      input.execution.nodeResults
        .filter((result) => result.status === WorkflowExecutionStatus.COMPLETED)
        .map((result) => result.nodeId),
    );
    completedNodeIds.add(input.nodeId);
    const skippedNodeIds = new Set<string>();

    const result = await this.engineAdapter.executeWorkflow(
      executableWorkflow,
      {
        executionId: input.executionId,
        nodeIds: remainingNodeIds,
        onNodeStatusChange: this.progressService.buildNodeStatusChangeHandler({
          baselineEstimatedDurationMs,
          completedNodeIds,
          executionId: input.executionId,
          progressFallback: input.execution.progress ?? 0,
          skippedNodeIds,
          startedAt: input.execution.startedAt ?? new Date(),
          userId: input.userId,
          workflow: executableWorkflow,
          workflowId: input.workflowId,
          workflowLabel: input.workflowLabel,
        }),
      },
    );

    const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);
    if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
      await this.finalizer.finalizeExecution({
        completedAt:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? new Date()
            : input.approvedAt,
        executionId: input.executionId,
        finalStatus,
        result,
        workflowId: input.workflowId,
        workflowStatus:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? WorkflowStatus.COMPLETED
            : WorkflowStatus.FAILED,
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
      inputCaption:
        typeof state.inputCaption === 'string' ? state.inputCaption : null,
      inputMedia:
        typeof state.inputMedia === 'string' ? state.inputMedia : null,
      nodeId,
      rawCaption: state.rawCaption,
      rawMedia: state.rawMedia,
      requestedAt:
        typeof state.requestedAt === 'string'
          ? state.requestedAt
          : new Date().toISOString(),
    };
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
