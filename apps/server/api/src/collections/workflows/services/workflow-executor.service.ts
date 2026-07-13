import { AgentScopeContextService } from '@api/collections/agent-threads/services/agent-scope-context.service';
import {
  type PendingReviewGateExecution,
  WorkflowExecutionsService,
} from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { ReviewGateNotificationService } from '@api/collections/workflows/services/review-gate-notification.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionFinalizerService } from '@api/collections/workflows/services/workflow-execution-finalizer.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  type ExecutableWorkflowRow,
} from '@api/collections/workflows/services/workflow-executor.constants';
import type {
  DelayResumeJobData,
  ReviewGateApprovalResult,
  ReviewGateTimeoutResolution,
  TriggerEvent,
  WorkflowExecutionResult,
} from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutorDocumentService } from '@api/collections/workflows/services/workflow-executor-document.service';
import { WorkflowNodeGraphRunnerService } from '@api/collections/workflows/services/workflow-node-graph-runner.service';
import { WorkflowNodeProgressTrackerService } from '@api/collections/workflows/services/workflow-node-progress-tracker.service';
import { WorkflowReviewGateService } from '@api/collections/workflows/services/workflow-review-gate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { toAgentScopeMetadata } from '@genfeedai/interfaces';
import { buildWorkflowEtaSnapshot } from '@helpers/generation-eta.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export {
  EXECUTABLE_WORKFLOW_SELECT,
  type ExecutableWorkflowRow,
} from '@api/collections/workflows/services/workflow-executor.constants';
export type {
  DelayResumeJobData,
  NodeExecutionSummary,
  ReviewGateApprovalResult,
  TriggerEvent,
  WorkflowExecutionResult,
} from '@api/collections/workflows/services/workflow-executor.types';

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
    );
    this.reviewGateService = new WorkflowReviewGateService(
      this.prisma,
      this.engineAdapter,
      this.executionsService,
      this.documentService,
      this.graphService,
      this.progressService,
      this.finalizer,
      this.reviewGateNotifier,
    );
    this.nodeProgressTracker = new WorkflowNodeProgressTrackerService(
      this.progressService,
      this.graphService,
    );
    this.graphRunner = new WorkflowNodeGraphRunnerService(
      this.engineAdapter,
      this.graphService,
      this.progressService,
      this.nodeProgressTracker,
      this.reviewGateService,
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
        where: { id: workflowId, isDeleted: false, organizationId },
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
      workflowDoc,
      userId,
      organizationId,
      inputValues,
      agentScope
        ? { ...metadata, agentScope: toAgentScopeMetadata(agentScope) }
        : metadata,
      trigger,
    );
  }

  async executeManualWorkflowDocument(
    workflowDoc: WorkflowDocument | ExecutableWorkflowRow,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
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

    const workflowDoc = await this.prisma.workflow.findFirst({
      select: EXECUTABLE_WORKFLOW_SELECT,
      where: {
        id: workflowId,
        isDeleted: false,
        organizationId: jobData.organizationId,
      },
    });

    if (!workflowDoc) {
      const errorMessage = `Workflow ${workflowId} not found for delay resume`;
      const failedExecution = await this.executionsService.completeExecution(
        executionId,
        errorMessage,
      );
      await this.progressService.publishWorkflowTaskUpdate({
        error: errorMessage,
        eta: this.progressService.extractEtaFromMetadata(
          failedExecution?.metadata,
        ),
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

    const normalizedWorkflowDoc =
      this.documentService.normalizeWorkflowDocument(workflowDoc);
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
        workflowDoc.brandId,
        'workflow',
      );
    }
    const resumedCompletedNodeIds = new Set(Object.keys(nodeOutputCache));
    const resumedSkippedNodeIds = new Set<string>();

    for (const node of executableWorkflow.nodes) {
      if (nodeOutputCache[node.id] !== undefined) {
        node.cachedOutput = nodeOutputCache[node.id];
      }
    }

    const result = await this.engineAdapter.executeWorkflow(
      executableWorkflow,
      {
        executionId,
        nodeIds: remainingNodeIds,
        onNodeStatusChange: this.progressService.buildNodeStatusChangeHandler({
          baselineEstimatedDurationMs:
            this.progressService.extractEstimatedDurationMs(
              existingExecution?.metadata,
            ),
          completedNodeIds: resumedCompletedNodeIds,
          executionId,
          progressFallback: existingExecution?.progress ?? 0,
          skippedNodeIds: resumedSkippedNodeIds,
          startedAt: existingExecution?.startedAt ?? new Date(),
          userId: triggerEvent.userId,
          workflow: executableWorkflow,
          workflowId,
          workflowLabel,
        }),
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
  ): Promise<WorkflowExecutionResult> {
    const workflowLabel = this.documentService.getWorkflowLabel(workflowDoc);
    const workflowId = String(
      (workflowDoc as unknown as Record<string, unknown>).id ??
        (workflowDoc as unknown as { id: string }).id,
    );
    const startedAt = new Date();
    const keepsWorkflowActive =
      trigger === WorkflowExecutionTrigger.SCHEDULED ||
      trigger === WorkflowExecutionTrigger.EVENT;

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
      (execution as unknown as Record<string, unknown>).id ??
        (execution as unknown as { id: string }).id,
    );

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

      await this.progressService.emitEvent(workflowId, 'started', {
        executionId,
        status: 'started',
      });

      const result = await this.graphRunner.executeNodeGraph(
        executableWorkflow,
        event,
        executionId,
        {
          baselineEstimatedDurationMs: initialEta.estimatedDurationMs,
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
        await this.progressService.emitEvent(workflowId, 'delayed', {
          executionId,
          status: finalStatus,
        });
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
        data: {
          status: keepsWorkflowActive
            ? WorkflowStatus.ACTIVE
            : WorkflowStatus.FAILED,
        },
        where: { id: workflowId },
      });

      await this.progressService.emitEvent(workflowId, 'error', {
        error: errorMessage,
        executionId,
      });

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
}
