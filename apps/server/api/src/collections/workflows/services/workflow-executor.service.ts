import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/enums';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
  NodeStatusChangeEvent,
} from '@genfeedai/workflow-engine';
import { buildWorkflowEtaSnapshot } from '@helpers/generation-eta.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trigger event payload that initiates workflow execution.
 * The `type` must match a trigger node type in the workflow graph.
 */
export interface TriggerEvent {
  /** Trigger type matching a trigger node (e.g. 'mentionTrigger', 'newFollowerTrigger') */
  type: string;
  /** Platform the event originated from */
  platform: string;
  /** Organization that owns the workflow */
  organizationId: string;
  /** User associated with the trigger */
  userId: string;
  /** Trigger-specific data passed as input to the trigger node */
  data: Record<string, unknown>;
}

/**
 * Result of a full workflow execution run.
 */
export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  nodeResults: NodeExecutionSummary[];
  totalCreditsUsed: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface NodeExecutionSummary {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  creditsUsed: number;
}

/**
 * Delay job data for BullMQ delayed job scheduling.
 */
export interface DelayResumeJobData {
  executionId: string;
  workflowId: string;
  organizationId: string;
  userId: string;
  /** The delay node that triggered the pause */
  delayNodeId: string;
  /** Remaining node IDs to execute after the delay */
  remainingNodeIds: string[];
  /** Cached outputs from already-executed nodes */
  nodeOutputCache: Record<string, unknown>;
  /** The trigger event that started this execution */
  triggerEvent: TriggerEvent;
}

interface PendingReviewGateState {
  nodeId: string;
  requestedAt: string;
  inputMedia: string | null;
  inputCaption: string | null;
  rawMedia?: unknown;
  rawCaption?: unknown;
}

interface ReviewGateApprovalResult {
  executionId: string;
  nodeId: string;
  status: 'approved' | 'rejected';
  approvedBy: string;
  approvedAt: string;
  rejectionReason?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Trigger node types that start a workflow */
const TRIGGER_NODE_TYPES = new Set([
  'mentionTrigger',
  'newFollowerTrigger',
  'newLikeTrigger',
  'newRepostTrigger',
  'trendTrigger',
]);

/** Maximum number of nodes per execution to prevent infinite loops */
const MAX_EXECUTION_NODES = 500;

/** Map from trigger event types to executor node types */
const EVENT_TYPE_TO_NODE_TYPE: Record<string, string> = {
  mention: 'mentionTrigger',
  mentionTrigger: 'mentionTrigger',
  newFollower: 'newFollowerTrigger',
  newFollowerTrigger: 'newFollowerTrigger',
  newLike: 'newLikeTrigger',
  newLikeTrigger: 'newLikeTrigger',
  newRepost: 'newRepostTrigger',
  newRepostTrigger: 'newRepostTrigger',
  trend: 'trendTrigger',
  trendTrigger: 'trendTrigger',
};

// =============================================================================
// SERVICE
// =============================================================================

/**
 * WorkflowExecutorService
 *
 * Orchestrates the full lifecycle of triggered workflow executions:
 * 1. Receives a trigger event
 * 2. Finds all published workflows that match the trigger
 * 3. Resolves node dependencies via topological sort
 * 4. Executes nodes in order with branching and delay support
 * 5. Tracks execution state per node in workflow-executions collection
 *
 * Branching: Condition nodes emit a `branch` metadata field ('true'/'false').
 *   Only edges whose sourceHandle matches the branch are followed.
 *
 * Delays: Delay nodes return `requiresDelayedJob: true` in metadata.
 *   Execution pauses and a delayed BullMQ job is scheduled to resume.
 */
@Injectable()
export class WorkflowExecutorService {
  private readonly logContext = 'WorkflowExecutorService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly executionsService: WorkflowExecutionsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
  ) {}

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Handle an incoming trigger event.
   * Finds all published workflows matching the trigger and executes them.
   * Returns the execution results for each matched workflow.
   */
  async handleTriggerEvent(
    event: TriggerEvent,
  ): Promise<WorkflowExecutionResult[]> {
    this.logger.log(`${this.logContext} handling trigger event`, {
      organizationId: event.organizationId,
      platform: event.platform,
      type: event.type,
    });

    const matchingWorkflows = await this.findMatchingWorkflows(event);

    if (matchingWorkflows.length === 0) {
      this.logger.debug(
        `${this.logContext} no matching workflows for trigger`,
        {
          organizationId: event.organizationId,
          type: event.type,
        },
      );
      return [];
    }

    this.logger.log(
      `${this.logContext} found ${matchingWorkflows.length} matching workflow(s)`,
      {
        workflowIds: matchingWorkflows.map((w) =>
          String(
            (w as unknown as Record<string, unknown>)._id ??
              (w as unknown as { id: string }).id,
          ),
        ),
      },
    );

    const results: WorkflowExecutionResult[] = [];

    for (const workflow of matchingWorkflows) {
      try {
        const result = await this.executeTriggeredWorkflow(workflow, event);
        results.push(result);
      } catch (error) {
        const workflowId = String(
          (workflow as unknown as Record<string, unknown>)._id ??
            (workflow as unknown as { id: string }).id,
        );
        this.logger.error(
          `${this.logContext} workflow execution failed`,
          error,
          { workflowId },
        );

        results.push({
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
          executionId: '',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.FAILED,
          totalCreditsUsed: 0,
          workflowId,
        });
      }
    }

    return results;
  }

  /**
   * Execute a specific workflow with a trigger event.
   * Creates an execution record, runs the node graph, and tracks results.
   */
  async executeTriggeredWorkflow(
    workflowDoc: WorkflowDocument,
    event: TriggerEvent,
  ): Promise<WorkflowExecutionResult> {
    return this.executeWorkflowDocument(
      workflowDoc,
      event,
      WorkflowExecutionTrigger.EVENT,
    );
  }

  async executeManualWorkflow(
    workflowId: string,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
  ): Promise<WorkflowExecutionResult> {
    const workflowDoc = await this.prisma.workflow.findFirst({
      where: { id: workflowId, isDeleted: false, organizationId },
    });

    if (!workflowDoc) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    return this.executeWorkflowDocument(
      workflowDoc,
      {
        data: inputValues,
        organizationId,
        platform: 'manual',
        type: 'manual',
        userId,
      },
      trigger,
      metadata,
    );
  }

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
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const workflowDoc = await this.prisma.workflow.findFirst({
      where: { id: workflowId, isDeleted: false, organizationId },
    });

    if (!workflowDoc) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

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
      execution.status !== WorkflowExecutionStatus.RUNNING
    ) {
      throw new BadRequestException(
        `Execution ${executionId} is not awaiting approval`,
      );
    }

    const approvedAt = new Date();
    const approvedAtIso = approvedAt.toISOString();

    if (!approved) {
      const rejectionMessage = rejectionReason || 'Rejected by reviewer';

      await this.executionsService.updateNodeResult(executionId, {
        completedAt: approvedAt,
        error: rejectionMessage,
        nodeId,
        nodeType: 'reviewGate',
        output: this.buildReviewGateNodeOutput(
          pendingApproval,
          executionId,
          'rejected',
          userId,
          approvedAtIso,
          rejectionMessage,
        ),
        status: WorkflowExecutionStatus.FAILED,
      });
      await this.executionsService.setFailedNodeId(executionId, nodeId);
      await this.executionsService.updateExecutionMetadata(executionId, {
        lastApproval: {
          approved: false,
          approvedAt: approvedAtIso,
          approvedBy: userId,
          nodeId,
          rejectionReason: rejectionMessage,
        },
        pendingApproval: null,
      });
      await this.executionsService.completeExecution(
        executionId,
        rejectionMessage,
      );
      await this.prisma.workflow.update({
        data: {
          completedAt: approvedAt,
          status: WorkflowStatus.FAILED,
        } as never,
        where: { id: workflowId },
      });

      return {
        approvedAt: approvedAtIso,
        approvedBy: userId,
        executionId,
        nodeId,
        rejectionReason: rejectionMessage,
        status: 'rejected',
      };
    }

    const approvedOutput = this.buildReviewGateApprovedOutput(pendingApproval);

    await this.executionsService.updateNodeResult(executionId, {
      completedAt: approvedAt,
      nodeId,
      nodeType: 'reviewGate',
      output: this.buildReviewGateNodeOutput(
        pendingApproval,
        executionId,
        'approved',
        userId,
        approvedAtIso,
      ),
      status: WorkflowExecutionStatus.COMPLETED,
    });
    await this.executionsService.updateExecutionMetadata(executionId, {
      lastApproval: {
        approved: true,
        approvedAt: approvedAtIso,
        approvedBy: userId,
        nodeId,
      },
      pendingApproval: null,
    });

    let executableWorkflow =
      this.engineAdapter.convertToExecutableWorkflow(workflowDoc);
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      execution.inputValues ?? {},
    );

    for (const node of executableWorkflow.nodes) {
      if (node.id === nodeId) {
        node.cachedOutput = approvedOutput;
        continue;
      }

      const nodeResult = execution.nodeResults.find(
        (result) =>
          result.nodeId === node.id &&
          result.status === WorkflowExecutionStatus.COMPLETED &&
          result.output !== undefined,
      );

      if (nodeResult?.output !== undefined) {
        node.cachedOutput = nodeResult.output;
      }
    }

    const downstreamNodeIds = this.collectDownstreamNodeIds(
      nodeId,
      executableWorkflow.edges,
      executableWorkflow.nodes,
    );
    const remainingNodeIds = downstreamNodeIds.filter(
      (downstreamNodeId) =>
        !execution.nodeResults.some(
          (result) =>
            result.nodeId === downstreamNodeId &&
            result.status === WorkflowExecutionStatus.COMPLETED,
        ),
    );

    if (remainingNodeIds.length === 0) {
      await this.executionsService.completeExecution(executionId);
      await this.prisma.workflow.update({
        data: {
          completedAt: approvedAt,
          status: WorkflowStatus.COMPLETED,
        } as never,
        where: { id: workflowId },
      });

      return {
        approvedAt: approvedAtIso,
        approvedBy: userId,
        executionId,
        nodeId,
        status: 'approved',
      };
    }

    const baselineEstimatedDurationMs = this.extractEstimatedDurationMs(
      execution.metadata,
    );
    const completedNodeIds = new Set(
      execution.nodeResults
        .filter((result) => result.status === WorkflowExecutionStatus.COMPLETED)
        .map((result) => result.nodeId),
    );
    completedNodeIds.add(nodeId);
    const skippedNodeIds = new Set<string>();

    const result = await this.engineAdapter.executeWorkflow(
      executableWorkflow,
      {
        nodeIds: remainingNodeIds,
        onNodeStatusChange: async (changeEvent: NodeStatusChangeEvent) => {
          const node =
            executableWorkflow.nodes.find(
              (candidate: ExecutableNode) =>
                candidate.id === changeEvent.nodeId,
            ) ?? null;
          const nodeLabel = node?.label ?? changeEvent.nodeId;
          const trackedExecution = await this.trackNodeResult(
            executionId,
            changeEvent.nodeId,
            node?.type ?? 'unknown',
            {
              completedAt:
                changeEvent.newStatus === 'completed' ||
                changeEvent.newStatus === 'failed'
                  ? new Date()
                  : undefined,
              error: changeEvent.error,
              output: changeEvent.output as Record<string, unknown> | undefined,
              startedAt:
                changeEvent.newStatus === 'running' ? new Date() : undefined,
              status: this.mapNodeStatus(changeEvent.newStatus),
            },
          );

          if (changeEvent.newStatus === 'completed') {
            completedNodeIds.add(changeEvent.nodeId);
          } else if (changeEvent.newStatus === 'skipped') {
            skippedNodeIds.add(changeEvent.nodeId);
          }

          await this.updateExecutionEta(executionId, executableWorkflow, {
            baselineEstimatedDurationMs,
            completedNodeIds,
            currentPhase:
              changeEvent.newStatus === 'failed'
                ? `Failed at ${nodeLabel}`
                : changeEvent.newStatus === 'completed'
                  ? `Completed ${nodeLabel}`
                  : changeEvent.newStatus === 'skipped'
                    ? `Skipped ${nodeLabel}`
                    : `Running ${nodeLabel}`,
            progress: trackedExecution?.progress ?? execution.progress ?? 0,
            skippedNodeIds,
            startedAt: execution.startedAt ?? new Date(),
            userId,
            workflowId,
            workflowLabel: workflowDoc.label,
          });
        },
      },
    );

    const finalStatus =
      result.status === 'completed'
        ? WorkflowExecutionStatus.COMPLETED
        : result.status === 'running'
          ? WorkflowExecutionStatus.RUNNING
          : WorkflowExecutionStatus.FAILED;

    if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
      await this.executionsService.completeExecution(
        executionId,
        finalStatus === WorkflowExecutionStatus.FAILED
          ? result.error
          : undefined,
      );

      if (result.totalCreditsUsed > 0) {
        await this.executionsService.setCreditsUsed(
          executionId,
          result.totalCreditsUsed,
        );
      }

      if (finalStatus === WorkflowExecutionStatus.FAILED) {
        const failedNode = this.findFirstFailedNodeId(result);
        if (failedNode) {
          await this.executionsService.setFailedNodeId(executionId, failedNode);
        }
      }

      await this.prisma.workflow.update({
        data: {
          completedAt:
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? new Date()
              : approvedAt,
          status:
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? WorkflowStatus.COMPLETED
              : WorkflowStatus.FAILED,
        } as never,
        where: { id: workflowId },
      });
    }

    return {
      approvedAt: approvedAtIso,
      approvedBy: userId,
      executionId,
      nodeId,
      status: 'approved',
    };
  }

  private async executeWorkflowDocument(
    workflowDoc: WorkflowDocument,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
    metadata?: Record<string, unknown>,
  ): Promise<WorkflowExecutionResult> {
    const workflowId = String(
      (workflowDoc as unknown as Record<string, unknown>)._id ??
        (workflowDoc as unknown as { id: string }).id,
    );
    const startedAt = new Date();

    let executableWorkflow =
      this.engineAdapter.convertToExecutableWorkflow(workflowDoc);
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      event.data,
    );
    const initialEta = buildWorkflowEtaSnapshot({
      currentPhase: 'Queued',
      edges: executableWorkflow.edges,
      nodes: executableWorkflow.nodes,
      startedAt,
    });
    const executionMetadata =
      metadata ??
      (trigger === WorkflowExecutionTrigger.EVENT
        ? {
            platform: event.platform,
            triggerType: event.type,
          }
        : {});

    // Create execution record
    const execution = await this.executionsService.createExecution(
      event.userId,
      event.organizationId,
      {
        inputValues: event.data,
        metadata: {
          ...executionMetadata,
          eta: initialEta,
        },
        trigger,
        workflow: workflowId as never,
      },
    );

    const executionId = String(
      (execution as unknown as Record<string, unknown>)._id ??
        (execution as unknown as { id: string }).id,
    );

    try {
      // Mark execution as running
      await this.executionsService.startExecution(executionId);
      await this.publishWorkflowTaskUpdate({
        eta: initialEta,
        executionId,
        progress: 0,
        status: 'processing',
        userId: event.userId,
        workflowId,
        workflowLabel: workflowDoc.label,
      });

      // Update workflow status
      await this.prisma.workflow.update({
        data: {
          executionCount: { increment: 1 },
          lastExecutedAt: new Date(),
          status: WorkflowStatus.RUNNING,
        } as never,
        where: { id: workflowId },
      });

      await this.emitEvent(workflowId, 'started', {
        executionId,
        status: 'started',
      });

      // Execute the node graph with branching and delay support
      const result = await this.executeNodeGraph(
        executableWorkflow,
        event,
        executionId,
        {
          baselineEstimatedDurationMs: initialEta.estimatedDurationMs,
          startedAt,
          workflowLabel: workflowDoc.label,
        },
      );

      // Determine final status — 'running' means paused at a delay node
      const finalStatus =
        result.status === 'completed'
          ? WorkflowExecutionStatus.COMPLETED
          : result.status === 'running'
            ? WorkflowExecutionStatus.RUNNING
            : WorkflowExecutionStatus.FAILED;

      // Only finalize if completed or failed — running (delayed) stays open
      if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
        const completedExecution =
          await this.executionsService.completeExecution(
            executionId,
            finalStatus === WorkflowExecutionStatus.FAILED
              ? result.error
              : undefined,
          );

        // Persist creditsUsed on the execution doc
        if (result.totalCreditsUsed > 0) {
          await this.executionsService.setCreditsUsed(
            executionId,
            result.totalCreditsUsed,
          );
        }

        // Persist failedNodeId on the execution doc
        if (finalStatus === WorkflowExecutionStatus.FAILED) {
          const failedNodeId = this.findFirstFailedNodeId(result);
          if (failedNodeId) {
            await this.executionsService.setFailedNodeId(
              executionId,
              failedNodeId,
            );
          }
        }

        // Update workflow status
        await this.prisma.workflow.update({
          data: {
            completedAt: new Date(),
            status:
              finalStatus === WorkflowExecutionStatus.COMPLETED
                ? WorkflowStatus.COMPLETED
                : WorkflowStatus.FAILED,
          } as never,
          where: { id: workflowId },
        });

        await this.emitEvent(
          workflowId,
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? 'completed'
            : 'failed',
          {
            executionId,
            status: finalStatus,
          },
        );

        await this.publishWorkflowTaskUpdate({
          error: result.error,
          eta: this.extractEtaFromMetadata(completedExecution?.metadata),
          executionId,
          progress: 100,
          resultId: executionId,
          status:
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? 'completed'
              : 'failed',
          userId: event.userId,
          workflowId,
          workflowLabel: workflowDoc.label,
        });
      } else {
        // Delay paused — emit event but don't finalize
        await this.emitEvent(workflowId, 'delayed', {
          executionId,
          status: finalStatus,
        });
      }

      // Build summary
      const nodeResults = this.buildNodeSummaries(
        result,
        executableWorkflow.nodes,
      );

      // Preserve _delayJobData for the processor to schedule resume
      const delayJobData = (result as unknown as Record<string, unknown>)
        ._delayJobData;

      return {
        completedAt: result.completedAt,
        error: result.error,
        executionId,
        nodeResults,
        startedAt,
        status: finalStatus,
        totalCreditsUsed: result.totalCreditsUsed,
        workflowId,
        ...(delayJobData ? { _delayJobData: delayJobData } : {}),
      } as WorkflowExecutionResult & {
        _delayJobData?: unknown;
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const failedExecution = await this.executionsService.completeExecution(
        executionId,
        errorMessage,
      );

      await this.prisma.workflow.update({
        data: { status: WorkflowStatus.FAILED } as never,
        where: { id: workflowId },
      });

      await this.emitEvent(workflowId, 'error', {
        error: errorMessage,
        executionId,
      });

      await this.publishWorkflowTaskUpdate({
        error: errorMessage,
        eta: this.extractEtaFromMetadata(failedExecution?.metadata),
        executionId,
        progress: 100,
        resultId: executionId,
        status: 'failed',
        userId: event.userId,
        workflowId,
        workflowLabel: workflowDoc.label,
      });

      throw error;
    }
  }

  /**
   * Resume a workflow execution after a delay node pause.
   * Re-hydrates the execution context and continues from where it stopped.
   */
  async resumeAfterDelay(
    jobData: DelayResumeJobData,
  ): Promise<WorkflowExecutionResult> {
    const {
      executionId,
      workflowId,
      delayNodeId,
      remainingNodeIds,
      nodeOutputCache,
      triggerEvent,
    } = jobData;

    this.logger.log(`${this.logContext} resuming after delay`, {
      delayNodeId,
      executionId,
      remainingNodeIds,
      workflowId,
    });

    const workflowDoc = await this.prisma.workflow.findFirst({
      where: { id: workflowId, isDeleted: false },
    });

    if (!workflowDoc) {
      const errorMessage = `Workflow ${workflowId} not found for delay resume`;
      const failedExecution = await this.executionsService.completeExecution(
        executionId,
        errorMessage,
      );
      await this.publishWorkflowTaskUpdate({
        error: errorMessage,
        eta: this.extractEtaFromMetadata(failedExecution?.metadata),
        executionId,
        progress: 100,
        resultId: executionId,
        status: 'failed',
        userId: triggerEvent.userId,
        workflowId,
        workflowLabel: workflowId,
      });
      return {
        completedAt: new Date(),
        error: errorMessage,
        executionId,
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.FAILED,
        totalCreditsUsed: 0,
        workflowId,
      };
    }

    let executableWorkflow =
      this.engineAdapter.convertToExecutableWorkflow(workflowDoc);
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      triggerEvent.data,
    );
    const existingExecution = await this.executionsService.findOne({
      id: executionId,
      isDeleted: false,
    });
    const baselineEstimatedDurationMs =
      typeof existingExecution?.metadata === 'object' &&
      existingExecution?.metadata !== null &&
      typeof (existingExecution.metadata as Record<string, unknown>).eta ===
        'object' &&
      (existingExecution.metadata as Record<string, unknown>).eta !== null &&
      typeof (
        (existingExecution.metadata as Record<string, unknown>).eta as Record<
          string,
          unknown
        >
      ).estimatedDurationMs === 'number'
        ? ((
            (existingExecution.metadata as Record<string, unknown>)
              .eta as Record<string, unknown>
          ).estimatedDurationMs as number)
        : undefined;
    const resumedCompletedNodeIds = new Set(Object.keys(nodeOutputCache));
    const resumedSkippedNodeIds = new Set<string>();

    // Pre-populate cached outputs from before the delay
    for (const node of executableWorkflow.nodes) {
      if (nodeOutputCache[node.id] !== undefined) {
        node.cachedOutput = nodeOutputCache[node.id];
      }
    }

    // Execute only the remaining nodes
    const result = await this.engineAdapter.executeWorkflow(
      executableWorkflow,
      {
        nodeIds: remainingNodeIds,
        onNodeStatusChange: async (changeEvent: NodeStatusChangeEvent) => {
          const node =
            executableWorkflow.nodes.find(
              (candidate: ExecutableNode) =>
                candidate.id === changeEvent.nodeId,
            ) ?? null;
          const nodeLabel = node?.label ?? changeEvent.nodeId;
          const trackedExecution = await this.trackNodeResult(
            executionId,
            changeEvent.nodeId,
            node?.type ?? 'unknown',
            {
              completedAt:
                changeEvent.newStatus === 'completed' ||
                changeEvent.newStatus === 'failed'
                  ? new Date()
                  : undefined,
              error: changeEvent.error,
              output: changeEvent.output as Record<string, unknown> | undefined,
              startedAt:
                changeEvent.newStatus === 'running' ? new Date() : undefined,
              status: this.mapNodeStatus(changeEvent.newStatus),
            },
          );

          if (changeEvent.newStatus === 'completed') {
            resumedCompletedNodeIds.add(changeEvent.nodeId);
          } else if (changeEvent.newStatus === 'skipped') {
            resumedSkippedNodeIds.add(changeEvent.nodeId);
          }

          await this.updateExecutionEta(executionId, executableWorkflow, {
            baselineEstimatedDurationMs,
            completedNodeIds: resumedCompletedNodeIds,
            currentPhase:
              changeEvent.newStatus === 'failed'
                ? `Failed at ${nodeLabel}`
                : changeEvent.newStatus === 'completed'
                  ? `Completed ${nodeLabel}`
                  : changeEvent.newStatus === 'skipped'
                    ? `Skipped ${nodeLabel}`
                    : `Running ${nodeLabel}`,
            progress:
              trackedExecution?.progress ?? existingExecution?.progress ?? 0,
            skippedNodeIds: resumedSkippedNodeIds,
            startedAt: existingExecution?.startedAt ?? new Date(),
            userId: triggerEvent.userId,
            workflowId,
            workflowLabel: workflowDoc.label,
          });
        },
      },
    );

    const finalStatus =
      result.status === 'completed'
        ? WorkflowExecutionStatus.COMPLETED
        : result.status === 'running'
          ? WorkflowExecutionStatus.RUNNING
          : WorkflowExecutionStatus.FAILED;

    // Only finalize if completed or failed — running (delayed) stays open
    if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
      const completedExecution = await this.executionsService.completeExecution(
        executionId,
        finalStatus === WorkflowExecutionStatus.FAILED
          ? result.error
          : undefined,
      );

      // Persist creditsUsed on the execution doc
      if (result.totalCreditsUsed > 0) {
        await this.executionsService.setCreditsUsed(
          executionId,
          result.totalCreditsUsed,
        );
      }

      // Persist failedNodeId on the execution doc
      if (finalStatus === WorkflowExecutionStatus.FAILED) {
        const failedNode = this.findFirstFailedNodeId(result);
        if (failedNode) {
          await this.executionsService.setFailedNodeId(executionId, failedNode);
        }
      }

      await this.prisma.workflow.update({
        data: {
          completedAt: new Date(),
          status:
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? WorkflowStatus.COMPLETED
              : WorkflowStatus.FAILED,
        } as never,
        where: { id: workflowId },
      });

      if (typeof this.websocketService?.publishWorkflowStatus === 'function') {
        await this.websocketService.publishWorkflowStatus(
          workflowId,
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? 'completed'
            : 'failed',
          triggerEvent.userId,
          {
            error:
              finalStatus === WorkflowExecutionStatus.FAILED
                ? result.error
                : undefined,
            workflowLabel: workflowDoc.label,
          },
        );
      }

      await this.publishWorkflowTaskUpdate({
        error: result.error,
        eta: this.extractEtaFromMetadata(completedExecution?.metadata),
        executionId,
        progress: 100,
        resultId: executionId,
        status:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? 'completed'
            : 'failed',
        userId: triggerEvent.userId,
        workflowId,
        workflowLabel: workflowDoc.label,
      });
    }

    const nodeResults = this.buildNodeSummaries(
      result,
      executableWorkflow.nodes,
    );

    return {
      completedAt: result.completedAt,
      error: result.error,
      executionId,
      nodeResults,
      startedAt: new Date(),
      status: finalStatus,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId,
    };
  }

  private async pauseForReviewGate(
    executionId: string,
    workflow: ExecutableWorkflow,
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    completedNodes: Set<string>,
    skippedNodes: Set<string>,
    startedAt: Date,
    userId: string,
    options: {
      baselineEstimatedDurationMs?: number;
      workflowLabel: string;
    },
    nodeResults: Map<string, NodeExecutionResult>,
    totalCreditsUsed: number,
  ): Promise<ExecutionRunResult | null> {
    const rawMedia = this.extractReviewGateInput(inputs, 'media');
    const rawCaption = this.extractReviewGateInput(inputs, 'caption');
    const requestedAt = new Date().toISOString();
    const pendingApproval: PendingReviewGateState = {
      inputCaption: this.extractCaptionPreview(rawCaption),
      inputMedia: this.extractMediaPreview(rawMedia),
      nodeId: node.id,
      rawCaption,
      rawMedia,
      requestedAt,
    };

    nodeResults.set(node.id, {
      creditsUsed: 0,
      nodeId: node.id,
      output: this.buildReviewGateNodeOutput(
        pendingApproval,
        executionId,
        'pending',
      ),
      retryCount: 0,
      startedAt: new Date(),
      status: 'completed',
    });

    const trackedExecution = await this.trackNodeResult(
      executionId,
      node.id,
      node.type,
      {
        output: this.buildReviewGateNodeOutput(
          pendingApproval,
          executionId,
          'pending',
        ),
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      },
    );

    await this.executionsService.updateExecutionMetadata(executionId, {
      pendingApproval,
    });

    await this.emitEvent(workflow.id, 'review-gate-pending', {
      approvalId: executionId,
      executionId,
      inputCaption: pendingApproval.inputCaption,
      inputMedia: pendingApproval.inputMedia,
      nodeId: node.id,
    });

    await this.updateExecutionEta(executionId, workflow, {
      baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
      completedNodeIds: completedNodes,
      currentPhase: `Waiting for approval: ${node.label}`,
      progress: trackedExecution?.progress ?? 0,
      skippedNodeIds: skippedNodes,
      startedAt,
      userId,
      workflowId: workflow.id,
      workflowLabel: options.workflowLabel,
    });

    return {
      completedAt: undefined,
      error: undefined,
      nodeResults,
      runId: executionId,
      startedAt,
      status: 'running',
      totalCreditsUsed,
      workflowId: workflow.id,
    };
  }

  // ===========================================================================
  // GRAPH EXECUTION
  // ===========================================================================

  /**
   * Execute the node graph with support for condition branching and delay pausing.
   *
   * Unlike the pure workflow engine which executes linearly, this method:
   * 1. Performs topological sort
   * 2. After each node execution, checks for branching (condition nodes)
   *    and prunes unreachable paths
   * 3. Checks for delay nodes and pauses execution if needed
   * 4. Tracks each node result in the execution record
   */
  private async executeNodeGraph(
    workflow: ExecutableWorkflow,
    triggerEvent: TriggerEvent,
    executionId: string,
    options: {
      baselineEstimatedDurationMs?: number;
      startedAt: Date;
      workflowLabel: string;
    },
  ): Promise<ExecutionRunResult> {
    const executionOrder = this.topologicalSort(workflow.nodes, workflow.edges);
    const nodeCache = new Map<string, unknown>();
    const nodeResults = new Map<string, NodeExecutionResult>();
    const completedNodes = new Set<string>();
    const skippedNodes = new Set<string>();
    let totalCreditsUsed = 0;
    const startedAt = options.startedAt;

    // Inject trigger data for trigger nodes
    const triggerNodeType =
      EVENT_TYPE_TO_NODE_TYPE[triggerEvent.type] ?? triggerEvent.type;
    const triggerNode = workflow.nodes.find(
      (n) => n.type === triggerNodeType || TRIGGER_NODE_TYPES.has(n.type),
    );
    if (triggerNode) {
      nodeCache.set(triggerNode.id, triggerEvent.data);
      completedNodes.add(triggerNode.id);
      nodeResults.set(triggerNode.id, {
        completedAt: new Date(),
        creditsUsed: 0,
        nodeId: triggerNode.id,
        output: triggerEvent.data,
        retryCount: 0,
        startedAt: new Date(),
        status: 'completed',
      });

      const trackedExecution = await this.trackNodeResult(
        executionId,
        triggerNode.id,
        triggerNode.type,
        {
          completedAt: new Date(),
          output: triggerEvent.data as Record<string, unknown>,
          startedAt: new Date(),
          status: WorkflowExecutionStatus.COMPLETED,
        },
      );

      await this.updateExecutionEta(executionId, workflow, {
        baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
        completedNodeIds: completedNodes,
        currentPhase: `Triggered ${triggerNode.label}`,
        progress: trackedExecution?.progress ?? 0,
        skippedNodeIds: skippedNodes,
        startedAt,
        userId: triggerEvent.userId,
        workflowId: workflow.id,
        workflowLabel: options.workflowLabel,
      });
    }

    // Pre-populate cache for locked nodes
    for (const node of workflow.nodes) {
      if (
        node.isLocked &&
        node.cachedOutput !== undefined &&
        workflow.lockedNodeIds.includes(node.id)
      ) {
        nodeCache.set(node.id, node.cachedOutput);
        completedNodes.add(node.id);
      }
    }

    let executionError: string | undefined;
    let executionStatus: 'completed' | 'failed' = 'completed';

    for (const nodeId of executionOrder) {
      // Skip trigger node (already handled) and locked nodes
      if (completedNodes.has(nodeId) || skippedNodes.has(nodeId)) {
        continue;
      }

      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        executionError = `Node ${nodeId} not found in workflow`;
        executionStatus = 'failed';
        break;
      }

      // Check if this node is reachable (not pruned by branching)
      if (
        !this.isNodeReachable(
          nodeId,
          workflow.edges,
          completedNodes,
          skippedNodes,
        )
      ) {
        skippedNodes.add(nodeId);
        continue;
      }

      // Check dependencies are satisfied
      if (
        !this.areDependenciesSatisfied(
          nodeId,
          workflow.edges,
          completedNodes,
          nodeCache,
        )
      ) {
        // Dependencies not met — check if they were skipped (branching)
        const deps = this.getNodeDependencies(nodeId, workflow.edges);
        const allDepsResolved = deps.every(
          (depId) => completedNodes.has(depId) || skippedNodes.has(depId),
        );

        if (allDepsResolved && deps.some((depId) => skippedNodes.has(depId))) {
          // All deps resolved but some skipped — skip this node too
          skippedNodes.add(nodeId);
          continue;
        }

        // Still waiting — should not happen in topological order
        executionError = `Dependencies not satisfied for node ${nodeId}`;
        executionStatus = 'failed';
        break;
      }

      // Guard: max nodes
      if (completedNodes.size + skippedNodes.size > MAX_EXECUTION_NODES) {
        executionError = 'Maximum execution node limit reached';
        executionStatus = 'failed';
        break;
      }

      // Gather inputs from upstream nodes
      const inputs = this.gatherInputs(node, workflow.edges, nodeCache);

      if (node.type === 'reviewGate') {
        const pausedResult = await this.pauseForReviewGate(
          executionId,
          workflow,
          node,
          inputs,
          completedNodes,
          skippedNodes,
          startedAt,
          triggerEvent.userId,
          options,
          nodeResults,
          totalCreditsUsed,
        );

        if (pausedResult) {
          return pausedResult;
        }
      }

      // Track node as running
      const runningExecution = await this.trackNodeResult(
        executionId,
        nodeId,
        node.type,
        {
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
        },
      );

      await this.emitEvent(workflow.id, 'node-started', {
        executionId,
        nodeId,
        nodeType: node.type,
      });

      await this.updateExecutionEta(executionId, workflow, {
        baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
        completedNodeIds: completedNodes,
        currentPhase: `Running ${node.label}`,
        progress: runningExecution?.progress ?? 0,
        skippedNodeIds: skippedNodes,
        startedAt,
        userId: triggerEvent.userId,
        workflowId: workflow.id,
        workflowLabel: options.workflowLabel,
      });

      try {
        // Execute the node via the engine adapter
        const nodeResult = await this.executeSingleNode(node, inputs, workflow);

        nodeResults.set(nodeId, nodeResult);
        totalCreditsUsed += nodeResult.creditsUsed;

        if (nodeResult.status === 'completed') {
          completedNodes.add(nodeId);

          if (nodeResult.output !== undefined) {
            nodeCache.set(nodeId, nodeResult.output);
          }

          // Handle condition branching
          if (node.type === 'condition') {
            const branch = this.extractBranch(nodeResult.output);
            this.pruneUnreachablePaths(
              nodeId,
              branch,
              workflow.edges,
              skippedNodes,
              executionOrder,
              completedNodes,
            );
          }

          // Handle delay nodes
          if (node.type === 'delay') {
            const delayMeta = this.extractDelayMetadata(nodeResult.output);
            if (delayMeta.requiresDelayedJob && delayMeta.delayMs > 0) {
              // Build remaining node IDs
              const currentIndex = executionOrder.indexOf(nodeId);
              const remainingNodeIds = executionOrder
                .slice(currentIndex + 1)
                .filter(
                  (id) => !completedNodes.has(id) && !skippedNodes.has(id),
                );

              // Serialize cache
              const cacheRecord: Record<string, unknown> = {};
              for (const [key, value] of nodeCache) {
                cacheRecord[key] = value;
              }

              // Build delay job data
              const delayJobData: DelayResumeJobData = {
                delayNodeId: nodeId,
                executionId,
                nodeOutputCache: cacheRecord,
                organizationId: workflow.organizationId,
                remainingNodeIds,
                triggerEvent,
                userId: workflow.userId,
                workflowId: workflow.id,
              };

              // Track delay pause
              const delayedExecution = await this.trackNodeResult(
                executionId,
                nodeId,
                node.type,
                {
                  completedAt: new Date(),
                  output: {
                    delayMs: delayMeta.delayMs,
                    paused: true,
                    resumeAt: delayMeta.resumeAt,
                  },
                  status: WorkflowExecutionStatus.COMPLETED,
                },
              );

              await this.emitEvent(workflow.id, 'delayed', {
                delayMs: delayMeta.delayMs,
                delayNodeId: nodeId,
                executionId,
                resumeAt: delayMeta.resumeAt,
              });

              await this.updateExecutionEta(executionId, workflow, {
                baselineEstimatedDurationMs:
                  options.baselineEstimatedDurationMs,
                completedNodeIds: completedNodes,
                currentPhase: 'Waiting to resume',
                progress: delayedExecution?.progress ?? 0,
                skippedNodeIds: skippedNodes,
                startedAt,
                userId: triggerEvent.userId,
                workflowId: workflow.id,
                workflowLabel: options.workflowLabel,
              });

              // Return a special result indicating the execution is paused
              // The caller (queue processor) will schedule the delayed job
              return {
                completedAt: undefined,
                error: undefined,
                nodeResults,
                runId: executionId,
                startedAt,
                status: 'running' as const,
                totalCreditsUsed,
                workflowId: workflow.id,
                // Attach delay metadata for the processor
                ...({ _delayJobData: delayJobData } as Record<string, unknown>),
              } as ExecutionRunResult & { _delayJobData?: DelayResumeJobData };
            }
          }

          // Track completed
          const completedExecution = await this.trackNodeResult(
            executionId,
            nodeId,
            node.type,
            {
              completedAt: new Date(),
              output: nodeResult.output as Record<string, unknown> | undefined,
              status: WorkflowExecutionStatus.COMPLETED,
            },
          );

          await this.emitEvent(workflow.id, 'node-completed', {
            executionId,
            nodeId,
            nodeType: node.type,
          });

          await this.updateExecutionEta(executionId, workflow, {
            baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
            completedNodeIds: completedNodes,
            currentPhase: `Completed ${node.label}`,
            progress: completedExecution?.progress ?? 0,
            skippedNodeIds: skippedNodes,
            startedAt,
            userId: triggerEvent.userId,
            workflowId: workflow.id,
            workflowLabel: options.workflowLabel,
          });
        } else {
          // Node failed — track error but continue (don't fail entire workflow)
          const failedExecution = await this.trackNodeResult(
            executionId,
            nodeId,
            node.type,
            {
              completedAt: new Date(),
              error: nodeResult.error,
              status: WorkflowExecutionStatus.FAILED,
            },
          );

          await this.emitEvent(workflow.id, 'node-failed', {
            error: nodeResult.error,
            executionId,
            nodeId,
            nodeType: node.type,
          });

          // Skip downstream nodes that depend on this failed node
          this.skipDownstreamNodes(
            nodeId,
            workflow.edges,
            executionOrder,
            skippedNodes,
            completedNodes,
          );

          // Don't set executionStatus to failed immediately —
          // other branches may still succeed
          await this.updateExecutionEta(executionId, workflow, {
            baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
            completedNodeIds: completedNodes,
            currentPhase: `Failed at ${node.label}`,
            error: nodeResult.error,
            progress: failedExecution?.progress ?? 0,
            skippedNodeIds: skippedNodes,
            startedAt,
            userId: triggerEvent.userId,
            workflowId: workflow.id,
            workflowLabel: options.workflowLabel,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        nodeResults.set(nodeId, {
          completedAt: new Date(),
          creditsUsed: 0,
          error: errorMessage,
          nodeId,
          retryCount: 0,
          startedAt: new Date(),
          status: 'failed',
        });

        const failedExecution = await this.trackNodeResult(
          executionId,
          nodeId,
          node.type,
          {
            completedAt: new Date(),
            error: errorMessage,
            status: WorkflowExecutionStatus.FAILED,
          },
        );

        await this.emitEvent(workflow.id, 'node-failed', {
          error: errorMessage,
          executionId,
          nodeId,
        });

        // Skip downstream
        this.skipDownstreamNodes(
          nodeId,
          workflow.edges,
          executionOrder,
          skippedNodes,
          completedNodes,
        );

        await this.updateExecutionEta(executionId, workflow, {
          baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
          completedNodeIds: completedNodes,
          currentPhase: `Failed at ${node.label}`,
          error: errorMessage,
          progress: failedExecution?.progress ?? 0,
          skippedNodeIds: skippedNodes,
          startedAt,
          userId: triggerEvent.userId,
          workflowId: workflow.id,
          workflowLabel: options.workflowLabel,
        });
      }
    }

    // Determine final status: failed if any non-skipped node failed
    const hasFailedNodes = Array.from(nodeResults.values()).some(
      (r) => r.status === 'failed',
    );

    if (hasFailedNodes || executionStatus === 'failed') {
      executionStatus = 'failed';
      if (!executionError) {
        const failedNodeIds = Array.from(nodeResults.entries())
          .filter(([_, r]) => r.status === 'failed')
          .map(([id]) => id);
        executionError = `Nodes failed: ${failedNodeIds.join(', ')}`;
      }
    }

    return {
      completedAt: new Date(),
      error: executionError,
      nodeResults,
      runId: executionId,
      startedAt,
      status: executionStatus,
      totalCreditsUsed,
      workflowId: workflow.id,
    };
  }

  // ===========================================================================
  // NODE EXECUTION
  // ===========================================================================

  /**
   * Execute a single node using the engine adapter's registered executors.
   */
  private async executeSingleNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    workflow: ExecutableWorkflow,
  ): Promise<NodeExecutionResult> {
    const startedAt = new Date();

    // Build a single-node workflow and execute it
    const singleNodeWorkflow: ExecutableWorkflow = {
      edges: [],
      id: workflow.id,
      lockedNodeIds: [],
      nodes: [{ ...node, cachedOutput: undefined, isLocked: false }],
      organizationId: workflow.organizationId,
      userId: workflow.userId,
    };

    // Set inputs as cached outputs of virtual upstream nodes
    // Create virtual nodes that hold the input data
    const virtualEdges: ExecutableEdge[] = [];
    for (const [key, value] of inputs) {
      const virtualNodeId = `__input_${key}`;
      singleNodeWorkflow.nodes.unshift({
        cachedOutput: value,
        config: {},
        id: virtualNodeId,
        inputs: [],
        isLocked: true,
        label: `Input: ${key}`,
        type: 'noop',
      });
      singleNodeWorkflow.lockedNodeIds.push(virtualNodeId);
      virtualEdges.push({
        id: `${virtualNodeId}-${node.id}`,
        source: virtualNodeId,
        target: node.id,
        targetHandle: key,
      });
    }
    singleNodeWorkflow.edges = virtualEdges;

    const result = await this.engineAdapter.executeWorkflow(
      singleNodeWorkflow,
      { maxRetries: 3 },
    );

    const nodeResult = result.nodeResults.get(node.id);

    if (nodeResult) {
      return nodeResult;
    }

    // Fallback if the node wasn't found in results
    return {
      completedAt: new Date(),
      creditsUsed: result.totalCreditsUsed,
      error: result.error,
      nodeId: node.id,
      retryCount: 0,
      startedAt,
      status: result.status === 'completed' ? 'completed' : 'failed',
    };
  }

  // ===========================================================================
  // WORKFLOW MATCHING
  // ===========================================================================

  /**
   * Find all published workflows that match a trigger event.
   * Matches on:
   * - Organization
   * - Lifecycle: published
   * - Contains a trigger node matching the event type and platform
   */
  private async findMatchingWorkflows(
    event: TriggerEvent,
  ): Promise<WorkflowDocument[]> {
    const executorNodeType = EVENT_TYPE_TO_NODE_TYPE[event.type] ?? event.type;

    // Query for published workflows in this organization
    const workflows = await this.prisma.workflow.findMany({
      where: {
        isDeleted: false,
        lifecycle: WorkflowLifecycle.PUBLISHED,
        organizationId: event.organizationId,
      },
    });

    // Filter by trigger node match
    return (workflows as WorkflowDocument[]).filter((workflow) => {
      if (!workflow.nodes || workflow.nodes.length === 0) {
        return false;
      }

      return workflow.nodes.some((node) => {
        // Check if node type maps to the trigger type
        const nodeExecutorType = this.resolveNodeType(node.type);
        if (nodeExecutorType !== executorNodeType) {
          return false;
        }

        // Check platform match if specified in node config
        const nodePlatform = node.data?.config?.platform as string | undefined;
        if (nodePlatform && nodePlatform !== event.platform) {
          return false;
        }

        return true;
      });
    });
  }

  /**
   * Resolve visual-builder node type to executor node type.
   * Uses the same mapping as WorkflowEngineAdapterService.
   */
  private resolveNodeType(visualNodeType: string): string {
    const NODE_TYPE_MAP: Record<string, string> = {
      'trigger-mention': 'mentionTrigger',
      'trigger-new-follower': 'newFollowerTrigger',
      'trigger-new-like': 'newLikeTrigger',
      'trigger-new-repost': 'newRepostTrigger',
    };
    return NODE_TYPE_MAP[visualNodeType] ?? visualNodeType;
  }

  private getPendingReviewGateState(
    metadata: Record<string, unknown> | undefined,
    nodeId: string,
  ): PendingReviewGateState | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const pendingApproval = (metadata as Record<string, unknown>)
      .pendingApproval;
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

  private extractEstimatedDurationMs(
    metadata: Record<string, unknown> | undefined,
  ): number | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }

    const eta = (metadata as Record<string, unknown>).eta;
    if (!eta || typeof eta !== 'object') {
      return undefined;
    }

    const estimatedDurationMs = (eta as Record<string, unknown>)
      .estimatedDurationMs;
    return typeof estimatedDurationMs === 'number'
      ? estimatedDurationMs
      : undefined;
  }

  private collectDownstreamNodeIds(
    nodeId: string,
    edges: ExecutableEdge[],
    nodes: ExecutableNode[],
  ): string[] {
    const downstream = new Set<string>();
    const visit = (currentNodeId: string) => {
      for (const edge of edges) {
        if (edge.source !== currentNodeId || downstream.has(edge.target)) {
          continue;
        }

        downstream.add(edge.target);
        visit(edge.target);
      }
    };

    visit(nodeId);

    const order = this.topologicalSort(nodes, edges);
    return order.filter((candidateNodeId) => downstream.has(candidateNodeId));
  }

  // ===========================================================================
  // GRAPH UTILITIES
  // ===========================================================================

  /**
   * Topological sort using Kahn's algorithm.
   */
  private topologicalSort(
    nodes: ExecutableNode[],
    edges: ExecutableEdge[],
  ): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      const adj = adjList.get(edge.source) ?? [];
      adj.push(edge.target);
      adjList.set(edge.source, adj);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      result.push(current);

      for (const neighbor of adjList.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Gather inputs for a node from upstream outputs.
   */
  private gatherInputs(
    node: ExecutableNode,
    edges: ExecutableEdge[],
    cache: Map<string, unknown>,
  ): Map<string, unknown> {
    const inputs = new Map<string, unknown>();

    for (const edge of edges) {
      if (edge.target === node.id) {
        const sourceOutput = cache.get(edge.source);
        if (sourceOutput !== undefined) {
          const handleKey = edge.targetHandle ?? edge.source;
          if (
            edge.targetHandle &&
            sourceOutput &&
            typeof sourceOutput === 'object' &&
            edge.targetHandle in (sourceOutput as Record<string, unknown>)
          ) {
            inputs.set(
              handleKey,
              (sourceOutput as Record<string, unknown>)[edge.targetHandle],
            );
          } else {
            inputs.set(handleKey, sourceOutput);
          }
        }
      }
    }

    return inputs;
  }

  /**
   * Get direct dependencies (source nodes) for a given node.
   */
  private getNodeDependencies(
    nodeId: string,
    edges: ExecutableEdge[],
  ): string[] {
    return edges.filter((e) => e.target === nodeId).map((e) => e.source);
  }

  /**
   * Check if all dependencies of a node are satisfied.
   */
  private areDependenciesSatisfied(
    nodeId: string,
    edges: ExecutableEdge[],
    completedNodes: Set<string>,
    cache: Map<string, unknown>,
  ): boolean {
    const deps = this.getNodeDependencies(nodeId, edges);
    return deps.every((depId) => completedNodes.has(depId) || cache.has(depId));
  }

  /**
   * Check if a node is reachable given completed and skipped nodes.
   * A node is unreachable if ALL its upstream sources are skipped.
   */
  private isNodeReachable(
    nodeId: string,
    edges: ExecutableEdge[],
    completedNodes: Set<string>,
    skippedNodes: Set<string>,
  ): boolean {
    const deps = this.getNodeDependencies(nodeId, edges);

    // No dependencies means always reachable (root node)
    if (deps.length === 0) {
      return true;
    }

    // Reachable if at least one dependency is completed (not skipped)
    return deps.some(
      (depId) => completedNodes.has(depId) && !skippedNodes.has(depId),
    );
  }

  // ===========================================================================
  // BRANCHING
  // ===========================================================================

  /**
   * Extract the branch direction from a condition node's output.
   * The condition executor stores branch as metadata: { branch: 'true' | 'false' }
   * But when going through the engine, the full ExecutorOutput.data is returned.
   */
  private extractBranch(output: unknown): string {
    if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      // The condition executor returns { result: boolean, ... } as data
      if ('result' in outputObj) {
        return outputObj.result ? 'true' : 'false';
      }
    }
    return 'true';
  }

  /**
   * After a condition node executes, prune the paths that won't be taken.
   * Edges from condition nodes use sourceHandle 'true' or 'false' to indicate
   * which branch they belong to.
   */
  private pruneUnreachablePaths(
    conditionNodeId: string,
    branch: string,
    edges: ExecutableEdge[],
    skippedNodes: Set<string>,
    executionOrder: string[],
    completedNodes: Set<string>,
  ): void {
    // Find edges from the condition node that DON'T match the taken branch
    const prunedEdges = edges.filter(
      (e) =>
        e.source === conditionNodeId &&
        e.sourceHandle !== undefined &&
        e.sourceHandle !== branch,
    );

    // Collect all downstream nodes from pruned edges
    const nodesToSkip = new Set<string>();
    for (const edge of prunedEdges) {
      this.collectDownstream(
        edge.target,
        edges,
        nodesToSkip,
        completedNodes,
        conditionNodeId,
      );
    }

    for (const nodeId of nodesToSkip) {
      skippedNodes.add(nodeId);
    }
  }

  /**
   * Recursively collect all downstream nodes from a starting node.
   * Stops at nodes that have other non-pruned sources (convergence points).
   */
  private collectDownstream(
    nodeId: string,
    edges: ExecutableEdge[],
    collected: Set<string>,
    completedNodes: Set<string>,
    originConditionNodeId: string,
  ): void {
    if (collected.has(nodeId) || completedNodes.has(nodeId)) {
      return;
    }

    // Check if this node has sources outside the pruned branch
    const sources = edges
      .filter((e) => e.target === nodeId)
      .map((e) => e.source);

    const hasNonPrunedSource = sources.some(
      (src) =>
        src !== originConditionNodeId &&
        !collected.has(src) &&
        (completedNodes.has(src) || !this.isInPrunedBranch(src, collected)),
    );

    if (hasNonPrunedSource) {
      // This node has an alternative path that isn't pruned
      return;
    }

    collected.add(nodeId);

    // Recurse to downstream nodes
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      this.collectDownstream(
        edge.target,
        edges,
        collected,
        completedNodes,
        originConditionNodeId,
      );
    }
  }

  private isInPrunedBranch(nodeId: string, prunedNodes: Set<string>): boolean {
    return prunedNodes.has(nodeId);
  }

  /**
   * Skip all downstream nodes when a node fails.
   */
  private skipDownstreamNodes(
    failedNodeId: string,
    edges: ExecutableEdge[],
    executionOrder: string[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const toSkip = new Set<string>();
    this.collectAllDownstream(failedNodeId, edges, toSkip, completedNodes);

    for (const nodeId of toSkip) {
      skippedNodes.add(nodeId);
    }
  }

  /**
   * Collect all downstream nodes (no convergence check — node failed).
   */
  private collectAllDownstream(
    nodeId: string,
    edges: ExecutableEdge[],
    collected: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      if (!collected.has(edge.target) && !completedNodes.has(edge.target)) {
        collected.add(edge.target);
        this.collectAllDownstream(
          edge.target,
          edges,
          collected,
          completedNodes,
        );
      }
    }
  }

  // ===========================================================================
  // DELAY HANDLING
  // ===========================================================================

  /**
   * Extract delay metadata from a delay node's output.
   */
  private extractDelayMetadata(output: unknown): {
    requiresDelayedJob: boolean;
    delayMs: number;
    resumeAt: string;
  } {
    if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      return {
        delayMs: (outputObj.delayMs as number) ?? 0,
        requiresDelayedJob:
          outputObj.delayMs !== undefined && (outputObj.delayMs as number) > 0,
        resumeAt: (outputObj.resumeAt as string) ?? new Date().toISOString(),
      };
    }
    return {
      delayMs: 0,
      requiresDelayedJob: false,
      resumeAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // EXECUTION TRACKING
  // ===========================================================================

  /**
   * Track a node's execution result in the workflow-executions collection.
   */
  private async trackNodeResult(
    executionId: string,
    nodeId: string,
    nodeType: string,
    updates: {
      status: WorkflowExecutionStatus;
      output?: Record<string, unknown>;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<Awaited<
    ReturnType<typeof this.executionsService.updateNodeResult>
  > | null> {
    try {
      // Use the executions service to update node results
      // Build a WorkflowNodeResult compatible object
      const nodeResult = {
        completedAt: updates.completedAt,
        error: updates.error,
        nodeId,
        nodeType,
        output: updates.output,
        progress:
          updates.status === WorkflowExecutionStatus.COMPLETED
            ? 100
            : updates.status === WorkflowExecutionStatus.RUNNING
              ? 0
              : undefined,
        startedAt: updates.startedAt ?? new Date(),
        status: updates.status,
      };

      // Count total nodes from execution for progress calculation
      return await this.executionsService.updateNodeResult(
        executionId,
        nodeResult as Parameters<
          typeof this.executionsService.updateNodeResult
        >[1],
      );
    } catch (error) {
      // Don't let tracking failures break execution
      this.logger.error(
        `${this.logContext} failed to track node result`,
        error,
        { executionId, nodeId },
      );
      return null;
    }
  }

  private async updateExecutionEta(
    executionId: string,
    workflow: ExecutableWorkflow,
    options: {
      baselineEstimatedDurationMs?: number;
      completedNodeIds?: Iterable<string>;
      skippedNodeIds?: Iterable<string>;
      currentPhase: string;
      startedAt: Date | string;
      userId: string;
      workflowId: string;
      workflowLabel: string;
      progress?: number;
      error?: string;
    },
  ): Promise<void> {
    const eta = buildWorkflowEtaSnapshot({
      baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
      completedNodeIds: options.completedNodeIds,
      currentPhase: options.currentPhase,
      edges: workflow.edges,
      nodes: workflow.nodes,
      skippedNodeIds: options.skippedNodeIds,
      startedAt: options.startedAt,
    });

    await this.executionsService.updateExecutionMetadata(executionId, {
      eta,
    });

    await this.publishWorkflowTaskUpdate({
      error: options.error,
      eta,
      executionId,
      progress: options.progress ?? 0,
      status: 'processing',
      userId: options.userId,
      workflowId: options.workflowId,
      workflowLabel: options.workflowLabel,
    });
  }

  private extractEtaFromMetadata(metadata: Record<string, unknown> | undefined):
    | {
        currentPhase?: string;
        estimatedDurationMs?: number;
        etaConfidence?: 'low' | 'medium' | 'high';
        lastEtaUpdateAt?: string;
        remainingDurationMs?: number;
        startedAt?: string;
      }
    | undefined {
    if (
      !metadata ||
      typeof metadata.eta !== 'object' ||
      metadata.eta === null
    ) {
      return undefined;
    }

    const eta = metadata.eta as Record<string, unknown>;
    return {
      currentPhase:
        typeof eta.currentPhase === 'string' ? eta.currentPhase : undefined,
      estimatedDurationMs:
        typeof eta.estimatedDurationMs === 'number'
          ? eta.estimatedDurationMs
          : undefined,
      etaConfidence:
        eta.etaConfidence === 'low' ||
        eta.etaConfidence === 'medium' ||
        eta.etaConfidence === 'high'
          ? eta.etaConfidence
          : undefined,
      lastEtaUpdateAt:
        typeof eta.lastEtaUpdateAt === 'string'
          ? eta.lastEtaUpdateAt
          : undefined,
      remainingDurationMs:
        typeof eta.remainingDurationMs === 'number'
          ? eta.remainingDurationMs
          : undefined,
      startedAt: typeof eta.startedAt === 'string' ? eta.startedAt : undefined,
    };
  }

  private async publishWorkflowTaskUpdate(input: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    eta?:
      | {
          currentPhase?: string;
          estimatedDurationMs?: number;
          etaConfidence?: 'low' | 'medium' | 'high';
          lastEtaUpdateAt?: string;
          remainingDurationMs?: number;
          startedAt?: string;
        }
      | undefined;
    error?: string;
    resultId?: string;
  }): Promise<void> {
    if (
      typeof this.websocketService?.publishBackgroundTaskUpdate !== 'function'
    ) {
      return;
    }

    await this.websocketService.publishBackgroundTaskUpdate({
      currentPhase:
        input.eta?.currentPhase ??
        (input.status === 'completed'
          ? 'Completed'
          : input.status === 'failed'
            ? 'Failed'
            : 'Processing'),
      error: input.error,
      estimatedDurationMs: input.eta?.estimatedDurationMs,
      etaConfidence: input.eta?.etaConfidence,
      label: input.workflowLabel,
      lastEtaUpdateAt: input.eta?.lastEtaUpdateAt ?? new Date().toISOString(),
      progress: input.progress,
      remainingDurationMs:
        input.status === 'completed' || input.status === 'failed'
          ? 0
          : input.eta?.remainingDurationMs,
      resultId: input.resultId,
      startedAt: input.eta?.startedAt,
      status: input.status,
      taskId: input.executionId,
      userId: input.userId,
    });
  }

  // ===========================================================================
  // STATUS MAPPING
  // ===========================================================================

  /**
   * Map engine node status to WorkflowExecutionStatus enum.
   */
  private mapNodeStatus(status: string): WorkflowExecutionStatus {
    switch (status) {
      case 'pending':
        return WorkflowExecutionStatus.PENDING;
      case 'running':
        return WorkflowExecutionStatus.RUNNING;
      case 'completed':
      case 'skipped':
        return WorkflowExecutionStatus.COMPLETED;
      case 'failed':
        return WorkflowExecutionStatus.FAILED;
      default:
        return WorkflowExecutionStatus.PENDING;
    }
  }

  // ===========================================================================
  // NODE RESULT SUMMARY
  // ===========================================================================

  private buildNodeSummaries(
    result: ExecutionRunResult,
    nodes: ExecutableNode[],
  ): NodeExecutionSummary[] {
    const summaries: NodeExecutionSummary[] = [];

    for (const [nodeId, nodeResult] of result.nodeResults) {
      const node = nodes.find((n) => n.id === nodeId);
      summaries.push({
        completedAt: nodeResult.completedAt,
        creditsUsed: nodeResult.creditsUsed,
        error: nodeResult.error,
        nodeId,
        nodeType: node?.type ?? 'unknown',
        output: nodeResult.output as Record<string, unknown> | undefined,
        retryCount: nodeResult.retryCount,
        startedAt: nodeResult.startedAt,
        status: this.mapNodeStatus(nodeResult.status),
      });
    }

    return summaries;
  }

  // ===========================================================================
  // FAILED NODE DETECTION
  // ===========================================================================

  private findFirstFailedNodeId(
    result: ExecutionRunResult,
  ): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // WEBSOCKET EVENTS
  // ===========================================================================

  private async emitEvent(
    workflowId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.websocketService) return;

    try {
      await this.websocketService.emit(`workflow:${workflowId}:${event}`, {
        workflowId,
        ...data,
      });
    } catch {
      // Ignore websocket errors
    }
  }
}
