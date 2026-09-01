import {
  ActionOrigin,
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { toAgentScopeMetadata } from '@genfeedai/interfaces';
import {
  AgentScopeContextService,
  resolveNestedActionOrigin,
  runWithActionOrigin,
  scopedWhere,
} from '@genfeedai/server';
import {
  applyWorkflowEtaProgress,
  precomputeWorkflowEtaPlan,
} from '@helpers/generation-eta.helper';
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

    const delayedExecution = await this.executionsService.findOne({
      id: executionId,
      organizationId: jobData.organizationId,
    });
    let workflowDoc: WorkflowDocument | null = null;
    let unavailableMessage = `Workflow ${workflowId} not found for delay resume`;
    if (delayedExecution) {
      try {
        workflowDoc = await this.documentService.findPinnedWorkflow(
          workflowId,
          delayedExecution.workflowVersionId,
          jobData.organizationId,
          delayedExecution.userId,
        );
      } catch (error) {
        if (!(error instanceof RetiredWorkflowExecutionError)) {
          throw error;
        }
        unavailableMessage = error.message;
      }
    }

    if (!workflowDoc) {
      return this.failUnavailablePinnedExecution({
        errorMessage: unavailableMessage,
        executionId,
        startedAt: delayedExecution?.startedAt ?? new Date(),
        userId: triggerEvent.userId,
        workflowId,
      });
    }

    const normalizedWorkflowDoc = workflowDoc;
    const workflowLabel = this.documentService.getWorkflowLabel(
      normalizedWorkflowDoc,
    );

    let executableWorkflow = this.engineAdapter.convertToExecutableWorkflow(
      normalizedWorkflowDoc,
    );
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      normalizedWorkflowDoc,
      executableWorkflow,
      triggerEvent.data,
    );
    const existingExecution =
      await this.executionsService.getRuntimeState(executionId);
    const resumedAgentScope = this.readPersistedAgentScope(
      existingExecution?.metadata,
      triggerEvent.userId,
      jobData.organizationId,
    );
    if (resumedAgentScope) {
      if (!this.agentScopeContextService) {
        throw new Error(
          'Agent scope validator is unavailable for delayed workflow execution.',
        );
      }
      await this.agentScopeContextService.assertConsequentialBoundary(
        resumedAgentScope,
        'workflow',
      );
      this.agentScopeContextService.assertResourceBrand(
        resumedAgentScope,
        normalizedWorkflowDoc.brandId,
        'workflow',
      );
    }
    const result = await this.graphRunner.executeNodeGraph(
      executableWorkflow,
      triggerEvent,
      executionId,
      {
        baselineEstimatedDurationMs:
          this.progressService.extractEstimatedDurationMs(
            existingExecution?.metadata,
          ),
        nodeOutputCache,
        startedAt: existingExecution?.startedAt ?? new Date(),
        workflowLabel,
      },
    );

    const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);

    if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
      const completedExecution = await this.finalizer.finalizeExecution({
        completedAt: new Date(),
        executionId,
        finalStatus,
        result,
        workflowId,
        workflowStatus:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? WorkflowStatus.COMPLETED
            : WorkflowStatus.FAILED,
      });
      this.progressService.clearEtaPlan(executionId);

      await this.progressService.publishWorkflowStatus(
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
          workflowLabel,
        },
      );

      await this.progressService.publishWorkflowTaskUpdate({
        error: result.error,
        eta: this.progressService.extractEtaFromMetadata(
          completedExecution?.metadata,
        ),
        executionId,
        progress: 100,
        resultId: executionId,
        status:
          finalStatus === WorkflowExecutionStatus.COMPLETED
            ? 'completed'
            : 'failed',
        userId: triggerEvent.userId,
        workflowId,
        workflowLabel,
      });
    }

    return {
      completedAt: result.completedAt,
      error: result.error,
      executionId,
      nodeResults: this.graphService.buildNodeSummaries(
        result,
        executableWorkflow.nodes,
      ),
      startedAt: new Date(),
      status: finalStatus,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId,
    };
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
    const workflowLabel = this.documentService.getWorkflowLabel(workflowDoc);
    const workflowId = String(
      (workflowDoc as unknown as Record<string, unknown>).id ??
        (workflowDoc as unknown as { id: string }).id,
    );
    const startedAt = new Date();
    const keepsWorkflowActive =
      trigger === WorkflowExecutionTrigger.SCHEDULED ||
      trigger === WorkflowExecutionTrigger.EVENT ||
      metadata?.isSystemAction === true;

    let executableWorkflow =
      this.engineAdapter.convertToExecutableWorkflow(workflowDoc);
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      event.data,
    );
    const etaPlan = precomputeWorkflowEtaPlan(
      executableWorkflow.nodes,
      executableWorkflow.edges,
    );
    const initialEta = applyWorkflowEtaProgress(etaPlan, {
      currentPhase: existingExecutionId ? 'Resuming' : 'Queued',
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

    let executionId = existingExecutionId;
    if (!executionId) {
      const execution = await this.executionsService.createExecution(
        event.userId,
        event.organizationId,
        {
          estimatedDurationMs: initialEta.estimatedDurationMs,
          etaConfidence: initialEta.etaConfidence,
          etaCurrentPhase: initialEta.currentPhase,
          inputValues: event.data,
          idempotencyKey,
          metadata: executionMetadata,
          remainingDurationMs: initialEta.remainingDurationMs,
          totalNodes: executableWorkflow.nodes.length,
          trigger,
          workflowId,
          workflowVersionId: workflowDoc.versionId,
        },
      );
      executionId = execution.id;
    }
    this.progressService.rememberEtaPlan(executionId, etaPlan);

    try {
      await this.executionsService.startExecution(executionId);
      await this.progressService.publishWorkflowTaskUpdate({
        eta: initialEta,
        executionId,
        progress: 0,
        status: 'processing',
        userId: event.userId,
        workflowId,
        workflowLabel,
      });

      await this.prisma.workflow.update({
        data: {
          ...(trigger !== WorkflowExecutionTrigger.SCHEDULED && {
            executionCount: { increment: 1 },
          }),
          lastExecutedAt: new Date(),
          status: keepsWorkflowActive
            ? WorkflowStatus.ACTIVE
            : WorkflowStatus.RUNNING,
        },
        where: { id: workflowId },
      });

      if (executableWorkflow.emitSharedEvents !== false) {
        await this.progressService.emitEvent(workflowId, 'started', {
          executionId,
          status: 'started',
        });
      }

      const result = await this.graphRunner.executeNodeGraph(
        executableWorkflow,
        event,
        executionId,
        {
          baselineEstimatedDurationMs: initialEta.estimatedDurationMs,
          respectLocks: graphOptions?.respectLocks,
          selectedNodeIds: graphOptions?.selectedNodeIds,
          startedAt,
          workflowLabel,
        },
      );
      const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);

      if (finalStatus !== WorkflowExecutionStatus.RUNNING) {
        const completedExecution = await this.finalizer.finalizeExecution({
          completedAt: new Date(),
          executionId,
          finalStatus,
          result,
          workflowId,
          workflowStatus: keepsWorkflowActive
            ? WorkflowStatus.ACTIVE
            : finalStatus === WorkflowExecutionStatus.COMPLETED
              ? WorkflowStatus.COMPLETED
              : WorkflowStatus.FAILED,
        });
        this.progressService.clearEtaPlan(executionId);

        if (
          trigger === WorkflowExecutionTrigger.SCHEDULED &&
          finalStatus === WorkflowExecutionStatus.COMPLETED
        ) {
          await this.engineAdapter.applyScheduledDigestCharge(
            workflowId,
            this.graphService.buildNodeSummaries(
              result,
              executableWorkflow.nodes,
            ),
          );
        }

        if (executableWorkflow.emitSharedEvents !== false) {
          await this.progressService.emitEvent(
            workflowId,
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? 'completed'
              : 'failed',
            {
              executionId,
              status: finalStatus,
            },
          );
        }

        await this.progressService.publishWorkflowTaskUpdate({
          error: result.error,
          eta: this.progressService.extractEtaFromMetadata(
            completedExecution?.metadata,
          ),
          executionId,
          progress: 100,
          resultId: executionId,
          status:
            finalStatus === WorkflowExecutionStatus.COMPLETED
              ? 'completed'
              : 'failed',
          userId: event.userId,
          workflowId,
          workflowLabel,
        });
      } else {
        if (executableWorkflow.emitSharedEvents !== false) {
          await this.progressService.emitEvent(workflowId, 'delayed', {
            executionId,
            status: finalStatus,
          });
        }
      }

      const delayJobData = (result as unknown as Record<string, unknown>)
        ._delayJobData;

      return {
        completedAt: result.completedAt,
        error: result.error,
        executionId,
        nodeResults: this.graphService.buildNodeSummaries(
          result,
          executableWorkflow.nodes,
        ),
        startedAt,
        status: finalStatus,
        totalCreditsUsed: result.totalCreditsUsed,
        workflowId,
        ...(delayJobData ? { _delayJobData: delayJobData } : {}),
      } as WorkflowExecutionResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const failedExecution = await this.executionsService.completeExecution(
        executionId,
        errorMessage,
      );

      await this.prisma.workflow.update({
        data: {
          status: keepsWorkflowActive
            ? WorkflowStatus.ACTIVE
            : WorkflowStatus.FAILED,
        },
        where: { id: workflowId },
      });

      if (executableWorkflow.emitSharedEvents !== false) {
        await this.progressService.emitEvent(workflowId, 'error', {
          error: errorMessage,
          executionId,
        });
      }

      await this.progressService.publishWorkflowTaskUpdate({
        error: errorMessage,
        eta: this.progressService.extractEtaFromMetadata(
          failedExecution?.metadata,
        ),
        executionId,
        progress: 100,
        resultId: executionId,
        status: 'failed',
        userId: event.userId,
        workflowId,
        workflowLabel,
      });

      throw error;
    }
  }

  private readPersistedAgentScope(
    metadata: Record<string, unknown> | undefined,
    userId: string,
    organizationId: string,
  ): ValidatedAgentScope | undefined {
    const value = metadata?.agentScope;
    if (value === undefined) {
      return undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Delayed workflow has invalid durable agent scope.');
    }

    const scope = value as Record<string, unknown>;
    const source = scope.source;
    const brandId = scope.brandId;
    if (
      typeof scope.threadId !== 'string' ||
      typeof scope.contextVersion !== 'number' ||
      !Number.isInteger(scope.contextVersion) ||
      scope.contextVersion < 1 ||
      scope.organizationId !== organizationId ||
      typeof scope.isLegacyFallback !== 'boolean' ||
      (brandId !== undefined && typeof brandId !== 'string') ||
      (source !== 'explicit' &&
        source !== 'thread_created' &&
        source !== 'legacy_execution_policy' &&
        source !== 'legacy_message_history' &&
        source !== 'legacy_organization_only')
    ) {
      throw new Error('Delayed workflow has invalid durable agent scope.');
    }

    return {
      brandId: typeof brandId === 'string' ? brandId : undefined,
      contextVersion: scope.contextVersion,
      isLegacyFallback: scope.isLegacyFallback,
      isVersionExplicit: true,
      organizationId,
      provenanceId:
        typeof scope.provenanceId === 'string' ? scope.provenanceId : undefined,
      source,
      threadId: scope.threadId,
      userId,
    };
  }

  private async failUnavailablePinnedExecution(input: {
    errorMessage: string;
    executionId: string;
    startedAt: Date;
    userId: string;
    workflowId: string;
  }): Promise<WorkflowExecutionResult> {
    const failedExecution = await this.executionsService.completeExecution(
      input.executionId,
      input.errorMessage,
    );
    await this.progressService.publishWorkflowTaskUpdate({
      error: input.errorMessage,
      eta: this.progressService.extractEtaFromMetadata(
        failedExecution?.metadata,
      ),
      executionId: input.executionId,
      progress: 100,
      resultId: input.executionId,
      status: 'failed',
      userId: input.userId,
      workflowId: input.workflowId,
      workflowLabel: input.workflowId,
    });
    return {
      completedAt: new Date(),
      error: input.errorMessage,
      executionId: input.executionId,
      nodeResults: [],
      startedAt: input.startedAt,
      status: WorkflowExecutionStatus.FAILED,
      totalCreditsUsed: 0,
      workflowId: input.workflowId,
    };
  }
}
