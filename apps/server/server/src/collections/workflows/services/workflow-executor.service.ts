import {
  ActionOrigin,
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { toAgentScopeMetadata } from '@genfeedai/interfaces';
import {
  AgentScopeContextService,
  resolveNestedActionOrigin,
  runWithActionOrigin,
  scopedWhere,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  type PendingReviewGateExecution,
  WorkflowExecutionsService,
} from '@server/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@server/collections/workflows/schemas/workflow.schema';
import { ReviewGateNotificationService } from '@server/collections/workflows/services/review-gate-notification.service';
import { WorkflowArtifactLifecycleService } from '@server/collections/workflows/services/workflow-artifact-lifecycle.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionFinalizerService } from '@server/collections/workflows/services/workflow-execution-finalizer.service';
import { WorkflowExecutionGraphService } from '@server/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@server/collections/workflows/services/workflow-execution-progress.service';
import { WorkflowExecutionRunnerService } from '@server/collections/workflows/services/workflow-execution-runner.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  type ExecutableWorkflowRow,
} from '@server/collections/workflows/services/workflow-executor.constants';
import type {
  DelayResumeJobData,
  ReviewGateApprovalResult,
  ReviewGateTimeoutResolution,
  TriggerEvent,
  WorkflowExecutionResult,
} from '@server/collections/workflows/services/workflow-executor.types';
import {
  RetiredWorkflowExecutionError,
  WorkflowExecutorDocumentService,
} from '@server/collections/workflows/services/workflow-executor-document.service';
import { WorkflowNodeClaimService } from '@server/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeContinuationService } from '@server/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeGraphRunnerService } from '@server/collections/workflows/services/workflow-node-graph-runner.service';
import { WorkflowNodeProgressTrackerService } from '@server/collections/workflows/services/workflow-node-progress-tracker.service';
import { WorkflowReviewGateService } from '@server/collections/workflows/services/workflow-review-gate.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@server/shared/utils/find-or-throw/find-or-throw.util';

export {
  EXECUTABLE_WORKFLOW_SELECT,
  type ExecutableWorkflowRow,
} from '@server/collections/workflows/services/workflow-executor.constants';
export type {
  DelayResumeJobData,
  NodeExecutionSummary,
  ReviewGateApprovalResult,
  TriggerEvent,
  WorkflowExecutionResult,
} from '@server/collections/workflows/services/workflow-executor.types';

/**
 * Public workflow execution façade.
 *
 * The execution internals are split into API-local runtime services so the
 * public API remains stable while graph traversal, review gates, progress/ETA,
 * and finalization stay testable in isolation.
 */
@Injectable()
export class WorkflowExecutorService {
  private readonly logContext = 'WorkflowExecutorService';
  private readonly documentService: WorkflowExecutorDocumentService;
  private readonly graphService: WorkflowExecutionGraphService;
  private readonly progressService: WorkflowExecutionProgressService;
  private readonly finalizer: WorkflowExecutionFinalizerService;
  private readonly reviewGateService: WorkflowReviewGateService;
  private readonly nodeProgressTracker: WorkflowNodeProgressTrackerService;
  private readonly graphRunner: WorkflowNodeGraphRunnerService;
  private readonly executionRunner: WorkflowExecutionRunnerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly executionsService: WorkflowExecutionsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional()
    private readonly reviewGateNotifier?: ReviewGateNotificationService,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
    @Optional()
    private readonly nodeClaimService?: WorkflowNodeClaimService,
    @Optional()
    private readonly artifactLifecycleService?: WorkflowArtifactLifecycleService,
    @Optional()
    private readonly nodeContinuationService?: WorkflowNodeContinuationService,
  ) {
    this.documentService = new WorkflowExecutorDocumentService(this.prisma);
    this.graphService = new WorkflowExecutionGraphService();
    this.progressService = new WorkflowExecutionProgressService(
      this.executionsService,
      this.logger,
      this.websocketService,
    );
    this.finalizer = new WorkflowExecutionFinalizerService(
      this.prisma,
      this.executionsService,
      this.graphService,
      this.websocketService,
      this.logger,
      this.artifactLifecycleService,
    );
    this.reviewGateService = new WorkflowReviewGateService(
      this.engineAdapter,
      this.executionsService,
      this.documentService,
      this.graphService,
      this.progressService,
      this.finalizer,
      this.reviewGateNotifier,
      (input) =>
        this.graphRunner.executeNodeGraph(
          input.workflow,
          input.triggerEvent,
          input.executionId,
          {
            nodeOutputCache: input.nodeOutputCache,
            startedAt: input.startedAt,
            workflowLabel: input.workflowLabel,
          },
        ),
    );
    this.nodeProgressTracker = new WorkflowNodeProgressTrackerService(
      this.progressService,
    );
    // Prefer injected claim service; fall back to a prisma-backed instance so
    // durable (executionId, nodeId) claims always exist in process (#2359).
    const durableClaims =
      this.nodeClaimService ??
      new WorkflowNodeClaimService(this.prisma, this.logger);
    this.graphRunner = new WorkflowNodeGraphRunnerService(
      this.engineAdapter,
      this.graphService,
      this.progressService,
      this.nodeProgressTracker,
      this.reviewGateService,
      this.executionsService,
      durableClaims,
      this.nodeContinuationService,
    );
    this.executionRunner = new WorkflowExecutionRunnerService(
      this.prisma,
      this.logger,
      this.engineAdapter,
      this.executionsService,
      this.documentService,
      this.graphService,
      this.progressService,
      this.finalizer,
      this.graphRunner,
      this.agentScopeContextService,
    );
  }

  async handleTriggerEvent(
    event: TriggerEvent,
  ): Promise<WorkflowExecutionResult[]> {
    this.logger.log(`${this.logContext} handling trigger event`, {
      organizationId: event.organizationId,
      platform: event.platform,
      type: event.type,
    });

    const matchingWorkflows =
      await this.documentService.findMatchingWorkflows(event);

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
        workflowIds: matchingWorkflows.map((workflow) =>
          String(
            (workflow as unknown as Record<string, unknown>).id ??
              (workflow as unknown as { id: string }).id,
          ),
        ),
      },
    );

    const results: WorkflowExecutionResult[] = [];

    for (const workflow of matchingWorkflows) {
      try {
        results.push(await this.executeTriggeredWorkflow(workflow, event));
      } catch (error) {
        const workflowId = String(
          (workflow as unknown as Record<string, unknown>).id ??
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
   * Continue (or no-op) an existing execution on BullMQ job retry (#2359).
   *
   * - COMPLETED → return terminal result without re-running nodes
   * - FAILED / RUNNING / PENDING → re-enter the graph on the **same**
   *   executionId so durable claims + hydrated nodeResults skip completed
   *   side-effect nodes instead of spawning a new execution
   */
  async continueExistingExecution(
    executionId: string,
    event: TriggerEvent,
  ): Promise<WorkflowExecutionResult> {
    const execution = await this.executionsService.findOne({
      id: executionId,
      organizationId: event.organizationId,
    });

    if (!execution) {
      this.logger.warn(
        `${this.logContext} continueExistingExecution: execution missing`,
        { executionId, organizationId: event.organizationId },
      );
      return {
        completedAt: new Date(),
        error: `Execution ${executionId} not found`,
        executionId,
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.FAILED,
        totalCreditsUsed: 0,
        workflowId: '',
      };
    }

    const workflowId = String(execution.workflowId ?? '');
    const status = String(execution.status);

    // Terminal executions must not re-enter the graph — durable claims already
    // settled side effects; re-running would either busy-skip forever or
    // re-fire publish/DM/credit nodes when claims are missing.
    if (
      status === WorkflowExecutionStatus.COMPLETED ||
      status === WorkflowExecutionStatus.CANCELLED
    ) {
      return {
        completedAt: execution.completedAt ?? new Date(),
        error: undefined,
        executionId,
        nodeResults: execution.nodeResults.map((nodeResult) => ({
          completedAt: nodeResult.completedAt ?? undefined,
          creditsUsed: nodeResult.creditsUsed ?? 0,
          error: nodeResult.error ?? undefined,
          nodeId: nodeResult.nodeId,
          nodeType: nodeResult.nodeType,
          output: nodeResult.output,
          retryCount: nodeResult.retryCount ?? 0,
          startedAt: nodeResult.startedAt ?? undefined,
          status: nodeResult.status as WorkflowExecutionStatus,
        })),
        startedAt: execution.startedAt ?? new Date(),
        status:
          status === WorkflowExecutionStatus.CANCELLED
            ? WorkflowExecutionStatus.CANCELLED
            : WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: execution.creditsUsed ?? 0,
        workflowId,
      };
    }

    let normalizedWorkflow: WorkflowDocument | null;
    try {
      normalizedWorkflow = await this.documentService.findPinnedWorkflow(
        workflowId,
        execution.workflowVersionId,
        event.organizationId,
        event.userId,
      );
    } catch (error) {
      if (error instanceof RetiredWorkflowExecutionError) {
        return this.failUnavailablePinnedExecution({
          errorMessage: error.message,
          executionId,
          startedAt: execution.startedAt ?? new Date(),
          userId: event.userId,
          workflowId,
        });
      }
      throw error;
    }
    if (!normalizedWorkflow) {
      return this.failUnavailablePinnedExecution({
        errorMessage: `Workflow version ${execution.workflowVersionId} not found for execution ${executionId}`,
        executionId,
        startedAt: execution.startedAt ?? new Date(),
        userId: event.userId,
        workflowId,
      });
    }

    return this.executeWorkflowDocumentWithActionOrigin(
      normalizedWorkflow,
      event,
      (execution.trigger as WorkflowExecutionTrigger | null) ??
        WorkflowExecutionTrigger.EVENT,
      {
        ...(execution.metadata ?? {}),
        continuedFromExecutionId: executionId,
      },
      executionId,
    );
  }

  async continueProviderCallbackExecution(input: {
    executionId: string;
    organizationId: string;
    workflowVersionId: string;
  }): Promise<WorkflowExecutionResult> {
    const execution = await this.executionsService.findOne({
      id: input.executionId,
      isDeleted: false,
      organizationId: input.organizationId,
    });
    if (!execution || execution.workflowVersionId !== input.workflowVersionId) {
      throw new Error(
        `Provider continuation execution ${input.executionId} does not match its immutable workflow version`,
      );
    }

    return this.continueExistingExecution(input.executionId, {
      data: execution.inputValues ?? {},
      organizationId: input.organizationId,
      platform:
        typeof execution.metadata?.platform === 'string'
          ? execution.metadata.platform
          : 'provider-callback',
      type:
        typeof execution.metadata?.triggerType === 'string'
          ? execution.metadata.triggerType
          : 'manual',
      userId: execution.userId,
    });
  }

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
    agentScope?: ValidatedAgentScope,
  ): Promise<WorkflowExecutionResult> {
    if (agentScope) {
      if (!this.agentScopeContextService) {
        throw new Error(
          'Agent scope validator is unavailable for workflow execution.',
        );
      }
      await this.agentScopeContextService.assertConsequentialBoundary(
        agentScope,
        'workflow',
      );
    }

    const workflowDoc = await findOrThrow(
      this.prisma.workflow,
      {
        select: EXECUTABLE_WORKFLOW_SELECT,
        where: scopedWhere(organizationId, { id: workflowId }),
      },
      'Workflow',
      workflowId,
    );

    if (agentScope) {
      this.agentScopeContextService?.assertResourceBrand(
        agentScope,
        workflowDoc.brandId,
        'workflow',
      );
    }

    return this.executeManualWorkflowDocument(
      this.documentService.normalizeWorkflowDocument(workflowDoc),
      userId,
      organizationId,
      inputValues,
      agentScope
        ? { ...metadata, agentScope: toAgentScopeMetadata(agentScope) }
        : metadata,
      trigger,
    );
  }

  async executePinnedManualWorkflow(
    workflowId: string,
    workflowVersionId: string,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<{
    execution: WorkflowExecutionResult;
    workflowLabel: string;
  }> {
    let workflowDoc: WorkflowDocument | null;
    try {
      workflowDoc = await this.documentService.findPinnedWorkflow(
        workflowId,
        workflowVersionId,
        organizationId,
        userId,
      );
    } catch (error) {
      if (error instanceof RetiredWorkflowExecutionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (!workflowDoc) {
      throw new Error(
        `Workflow ${workflowId} version ${workflowVersionId} is unavailable in organization ${organizationId}`,
      );
    }

    if (idempotencyKey) {
      const existingExecution = await this.executionsService.findOne({
        idempotencyKey,
        isDeleted: false,
        organizationId,
      });
      if (existingExecution) {
        return {
          execution: await this.continueExistingExecution(
            existingExecution.id,
            {
              data: inputValues,
              organizationId,
              platform: 'manual',
              type: 'manual',
              userId,
            },
          ),
          workflowLabel: this.documentService.getWorkflowLabel(workflowDoc),
        };
      }
    }

    return {
      execution: await this.executeManualWorkflowDocument(
        workflowDoc,
        userId,
        organizationId,
        inputValues,
        metadata,
        WorkflowExecutionTrigger.API,
        idempotencyKey,
      ),
      workflowLabel: this.documentService.getWorkflowLabel(workflowDoc),
    };
  }

  async executeManualWorkflowDocument(
    workflowDoc: WorkflowDocument | ExecutableWorkflowRow,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
    idempotencyKey?: string,
  ): Promise<WorkflowExecutionResult> {
    return this.executeWorkflowDocument(
      this.documentService.normalizeWorkflowDocument(workflowDoc),
      {
        data: inputValues,
        organizationId,
        platform: 'manual',
        type: 'manual',
        userId,
      },
      trigger,
      metadata,
      undefined,
      idempotencyKey,
    );
  }

  async executePartialWorkflowDocument(
    workflowDoc: WorkflowDocument | ExecutableWorkflowRow,
    userId: string,
    organizationId: string,
    nodeIds: string[],
    respectLocks = true,
  ): Promise<WorkflowExecutionResult> {
    return this.executeWorkflowDocument(
      this.documentService.normalizeWorkflowDocument(workflowDoc),
      {
        data: {},
        organizationId,
        platform: 'manual',
        type: 'partial',
        userId,
      },
      WorkflowExecutionTrigger.MANUAL,
      {
        executionMode: 'partial',
        selectedNodeIds: nodeIds,
      },
      { respectLocks, selectedNodeIds: nodeIds },
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
    return this.reviewGateService.submitReviewGateApproval(
      workflowId,
      executionId,
      userId,
      organizationId,
      nodeId,
      approved,
      rejectionReason,
    );
  }

  /**
   * Auto-resolve a review gate whose reviewer timeout has elapsed. Invoked by
   * the workers-side review-gate timeout sweep.
   */
  async resolveTimedOutReviewGate(
    workflowId: string,
    executionId: string,
    organizationId: string,
    nodeId: string,
  ): Promise<ReviewGateTimeoutResolution | null> {
    return this.reviewGateService.resolveTimedOutReviewGate(
      workflowId,
      executionId,
      organizationId,
      nodeId,
    );
  }

  /**
   * Passthrough for the workers timeout sweep — workers must not import the
   * @api workflow-executions service directly (#1090 import boundary).
   */
  async findPendingReviewGateExecutions(): Promise<
    PendingReviewGateExecution[]
  > {
    return this.executionsService.findPendingReviewGateExecutions();
  }

  async resumeAfterDelay(
    jobData: DelayResumeJobData,
  ): Promise<WorkflowExecutionResult> {
    return this.executionRunner.resumeAfterDelay(jobData);
  }
  private async executeWorkflowDocument(
    workflowDoc: WorkflowDocument,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
    metadata?: Record<string, unknown>,
    graphOptions?: { respectLocks?: boolean; selectedNodeIds?: string[] },
    idempotencyKey?: string,
  ): Promise<WorkflowExecutionResult> {
    return runWithActionOrigin(
      resolveNestedActionOrigin(ActionOrigin.WORKFLOW),
      () =>
        this.executeWorkflowDocumentWithActionOrigin(
          workflowDoc,
          event,
          trigger,
          metadata,
          undefined,
          graphOptions,
          idempotencyKey,
        ),
    );
  }

  private async executeWorkflowDocumentWithActionOrigin(
    workflowDoc: WorkflowDocument,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
    metadata?: Record<string, unknown>,
    existingExecutionId?: string,
    graphOptions?: { respectLocks?: boolean; selectedNodeIds?: string[] },
    idempotencyKey?: string,
  ): Promise<WorkflowExecutionResult> {
    return this.executionRunner.executeWorkflowDocument(
      workflowDoc,
      event,
      trigger,
      metadata,
      existingExecutionId,
      graphOptions,
      idempotencyKey,
    );
  }
}
