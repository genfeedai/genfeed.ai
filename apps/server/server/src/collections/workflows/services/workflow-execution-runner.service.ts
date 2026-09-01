import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import type {
  ExecutableWorkflow,
  ExecutionRunResult,
} from '@genfeedai/workflows/engine';
import {
  applyWorkflowEtaProgress,
  precomputeWorkflowEtaPlan,
  type WorkflowEtaPlan,
} from '@helpers/generation-eta.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { WorkflowExecutionsService } from '@server/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@server/collections/workflows/schemas/workflow.schema';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionFinalizerService } from '@server/collections/workflows/services/workflow-execution-finalizer.service';
import { WorkflowExecutionGraphService } from '@server/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@server/collections/workflows/services/workflow-execution-progress.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
  WorkflowExecutionResult,
} from '@server/collections/workflows/services/workflow-executor.types';
import {
  RetiredWorkflowExecutionError,
  WorkflowExecutorDocumentService,
} from '@server/collections/workflows/services/workflow-executor-document.service';
import { WorkflowNodeGraphRunnerService } from '@server/collections/workflows/services/workflow-node-graph-runner.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type PreparedWorkflowExecution = {
  etaPlan: WorkflowEtaPlan;
  executableWorkflow: ExecutableWorkflow;
  executionId: string;
  initialEta: ReturnType<typeof applyWorkflowEtaProgress>;
  keepsWorkflowActive: boolean;
  startedAt: Date;
  workflowId: string;
  workflowLabel: string;
};

export class WorkflowExecutionRunnerService {
  private readonly logContext = 'WorkflowExecutorService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly executionsService: WorkflowExecutionsService,
    private readonly documentService: WorkflowExecutorDocumentService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly finalizer: WorkflowExecutionFinalizerService,
    private readonly graphRunner: WorkflowNodeGraphRunnerService,
    private readonly agentScopeContextService?: AgentScopeContextService,
  ) {}

  async resumeAfterDelay(
    jobData: DelayResumeJobData,
  ): Promise<WorkflowExecutionResult> {
    const { executionId, workflowId, triggerEvent } = jobData;
    this.logger.log(`${this.logContext} resuming after delay`, {
      delayNodeId: jobData.delayNodeId,
      executionId,
      remainingNodeIds: jobData.remainingNodeIds,
      workflowId,
    });

    const delayedExecution = await this.executionsService.findOne({
      id: executionId,
      organizationId: jobData.organizationId,
    });
    const { workflowDoc, unavailableMessage } = await this.loadDelayedWorkflow(
      jobData,
      delayedExecution,
    );
    if (!workflowDoc) {
      return this.failUnavailablePinnedExecution({
        errorMessage: unavailableMessage,
        executionId,
        startedAt: delayedExecution?.startedAt ?? new Date(),
        userId: triggerEvent.userId,
        workflowId,
      });
    }

    const workflowLabel = this.documentService.getWorkflowLabel(workflowDoc);
    let executableWorkflow =
      this.engineAdapter.convertToExecutableWorkflow(workflowDoc);
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      triggerEvent.data,
    );
    const existingExecution =
      await this.executionsService.getRuntimeState(executionId);
    await this.assertResumedAgentScope(
      existingExecution?.metadata,
      triggerEvent.userId,
      jobData.organizationId,
      workflowDoc.brandId,
    );

    const result = await this.graphRunner.executeNodeGraph(
      executableWorkflow,
      triggerEvent,
      executionId,
      {
        baselineEstimatedDurationMs:
          this.progressService.extractEstimatedDurationMs(
            existingExecution?.metadata,
          ),
        nodeOutputCache: jobData.nodeOutputCache,
        startedAt: existingExecution?.startedAt ?? new Date(),
        workflowLabel,
      },
    );
    const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);
    await this.finalizeResumedExecution({
      executionId,
      finalStatus,
      result,
      triggerEvent,
      workflowId,
      workflowLabel,
    });

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

  async executeWorkflowDocument(
    workflowDoc: WorkflowDocument,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
    metadata?: Record<string, unknown>,
    existingExecutionId?: string,
    graphOptions?: { respectLocks?: boolean; selectedNodeIds?: string[] },
    idempotencyKey?: string,
  ): Promise<WorkflowExecutionResult> {
    const prepared = await this.prepareExecution({
      event,
      existingExecutionId,
      idempotencyKey,
      metadata,
      trigger,
      workflowDoc,
    });
    this.progressService.rememberEtaPlan(
      prepared.executionId,
      prepared.etaPlan,
    );

    try {
      await this.startExecution(prepared, event, trigger);
      const result = await this.graphRunner.executeNodeGraph(
        prepared.executableWorkflow,
        event,
        prepared.executionId,
        {
          baselineEstimatedDurationMs: prepared.initialEta.estimatedDurationMs,
          respectLocks: graphOptions?.respectLocks,
          selectedNodeIds: graphOptions?.selectedNodeIds,
          startedAt: prepared.startedAt,
          workflowLabel: prepared.workflowLabel,
        },
      );
      const finalStatus = this.finalizer.mapRunResultToExecutionStatus(result);
      await this.finalizeRun(prepared, event, trigger, result, finalStatus);
      return this.buildExecutionResult(prepared, result, finalStatus);
    } catch (error) {
      await this.failRun(prepared, event, error);
      throw error;
    }
  }

  private async prepareExecution(input: {
    event: TriggerEvent;
    existingExecutionId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    trigger: WorkflowExecutionTrigger;
    workflowDoc: WorkflowDocument;
  }): Promise<PreparedWorkflowExecution> {
    const workflowLabel = this.documentService.getWorkflowLabel(
      input.workflowDoc,
    );
    const workflowId = String(
      (input.workflowDoc as unknown as Record<string, unknown>).id ??
        (input.workflowDoc as unknown as { id: string }).id,
    );
    const startedAt = new Date();
    const keepsWorkflowActive =
      input.trigger === WorkflowExecutionTrigger.SCHEDULED ||
      input.trigger === WorkflowExecutionTrigger.EVENT ||
      input.metadata?.isSystemAction === true;
    let executableWorkflow = this.engineAdapter.convertToExecutableWorkflow(
      input.workflowDoc,
    );
    executableWorkflow = this.engineAdapter.applyRuntimeInputValues(
      input.workflowDoc,
      executableWorkflow,
      input.event.data,
    );
    const etaPlan = precomputeWorkflowEtaPlan(
      executableWorkflow.nodes,
      executableWorkflow.edges,
    );
    const initialEta = applyWorkflowEtaProgress(etaPlan, {
      currentPhase: input.existingExecutionId ? 'Resuming' : 'Queued',
      startedAt,
    });
    const executionId =
      input.existingExecutionId ??
      (
        await this.executionsService.createExecution(
          input.event.userId,
          input.event.organizationId,
          {
            estimatedDurationMs: initialEta.estimatedDurationMs,
            etaConfidence: initialEta.etaConfidence,
            etaCurrentPhase: initialEta.currentPhase,
            inputValues: input.event.data,
            idempotencyKey: input.idempotencyKey,
            metadata:
              input.metadata ??
              (input.trigger === WorkflowExecutionTrigger.EVENT
                ? {
                    platform: input.event.platform,
                    triggerType: input.event.type,
                  }
                : {}),
            remainingDurationMs: initialEta.remainingDurationMs,
            totalNodes: executableWorkflow.nodes.length,
            trigger: input.trigger,
            workflowId,
            workflowVersionId: input.workflowDoc.versionId,
          },
        )
      ).id;
    return {
      etaPlan,
      executableWorkflow,
      executionId,
      initialEta,
      keepsWorkflowActive,
      startedAt,
      workflowId,
      workflowLabel,
    };
  }

  private async startExecution(
    prepared: PreparedWorkflowExecution,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
  ): Promise<void> {
    await this.executionsService.startExecution(prepared.executionId);
    await this.progressService.publishWorkflowTaskUpdate({
      eta: prepared.initialEta,
      executionId: prepared.executionId,
      progress: 0,
      status: 'processing',
      userId: event.userId,
      workflowId: prepared.workflowId,
      workflowLabel: prepared.workflowLabel,
    });
    await this.prisma.workflow.update({
      data: {
        ...(trigger !== WorkflowExecutionTrigger.SCHEDULED && {
          executionCount: { increment: 1 },
        }),
        lastExecutedAt: new Date(),
        status: prepared.keepsWorkflowActive
          ? WorkflowStatus.ACTIVE
          : WorkflowStatus.RUNNING,
      },
      where: { id: prepared.workflowId },
    });
    if (prepared.executableWorkflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(prepared.workflowId, 'started', {
        executionId: prepared.executionId,
        status: 'started',
      });
    }
  }

  private async finalizeRun(
    prepared: PreparedWorkflowExecution,
    event: TriggerEvent,
    trigger: WorkflowExecutionTrigger,
    result: ExecutionRunResult,
    finalStatus: WorkflowExecutionStatus,
  ): Promise<void> {
    if (finalStatus === WorkflowExecutionStatus.RUNNING) {
      if (prepared.executableWorkflow.emitSharedEvents !== false) {
        await this.progressService.emitEvent(prepared.workflowId, 'delayed', {
          executionId: prepared.executionId,
          status: finalStatus,
        });
      }
      return;
    }
    const completedExecution = await this.finalizer.finalizeExecution({
      completedAt: new Date(),
      executionId: prepared.executionId,
      finalStatus,
      result,
      workflowId: prepared.workflowId,
      workflowStatus: prepared.keepsWorkflowActive
        ? WorkflowStatus.ACTIVE
        : finalStatus === WorkflowExecutionStatus.COMPLETED
          ? WorkflowStatus.COMPLETED
          : WorkflowStatus.FAILED,
    });
    this.progressService.clearEtaPlan(prepared.executionId);
    if (
      trigger === WorkflowExecutionTrigger.SCHEDULED &&
      finalStatus === WorkflowExecutionStatus.COMPLETED
    ) {
      await this.engineAdapter.applyScheduledDigestCharge(
        prepared.workflowId,
        this.graphService.buildNodeSummaries(
          result,
          prepared.executableWorkflow.nodes,
        ),
      );
    }
    if (prepared.executableWorkflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(
        prepared.workflowId,
        finalStatus === WorkflowExecutionStatus.COMPLETED
          ? 'completed'
          : 'failed',
        { executionId: prepared.executionId, status: finalStatus },
      );
    }
    await this.progressService.publishWorkflowTaskUpdate({
      error: result.error,
      eta: this.progressService.extractEtaFromMetadata(
        completedExecution?.metadata,
      ),
      executionId: prepared.executionId,
      progress: 100,
      resultId: prepared.executionId,
      status:
        finalStatus === WorkflowExecutionStatus.COMPLETED
          ? 'completed'
          : 'failed',
      userId: event.userId,
      workflowId: prepared.workflowId,
      workflowLabel: prepared.workflowLabel,
    });
  }

  private buildExecutionResult(
    prepared: PreparedWorkflowExecution,
    result: ExecutionRunResult,
    finalStatus: WorkflowExecutionStatus,
  ): WorkflowExecutionResult {
    const delayJobData = (result as unknown as Record<string, unknown>)
      ._delayJobData;
    return {
      completedAt: result.completedAt,
      error: result.error,
      executionId: prepared.executionId,
      nodeResults: this.graphService.buildNodeSummaries(
        result,
        prepared.executableWorkflow.nodes,
      ),
      startedAt: prepared.startedAt,
      status: finalStatus,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId: prepared.workflowId,
      ...(delayJobData ? { _delayJobData: delayJobData } : {}),
    } as WorkflowExecutionResult;
  }

  private async failRun(
    prepared: PreparedWorkflowExecution,
    event: TriggerEvent,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedExecution = await this.executionsService.completeExecution(
      prepared.executionId,
      errorMessage,
    );
    await this.prisma.workflow.update({
      data: {
        status: prepared.keepsWorkflowActive
          ? WorkflowStatus.ACTIVE
          : WorkflowStatus.FAILED,
      },
      where: { id: prepared.workflowId },
    });
    if (prepared.executableWorkflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(prepared.workflowId, 'error', {
        error: errorMessage,
        executionId: prepared.executionId,
      });
    }
    await this.progressService.publishWorkflowTaskUpdate({
      error: errorMessage,
      eta: this.progressService.extractEtaFromMetadata(
        failedExecution?.metadata,
      ),
      executionId: prepared.executionId,
      progress: 100,
      resultId: prepared.executionId,
      status: 'failed',
      userId: event.userId,
      workflowId: prepared.workflowId,
      workflowLabel: prepared.workflowLabel,
    });
  }

  private async loadDelayedWorkflow(
    jobData: DelayResumeJobData,
    delayedExecution: Awaited<ReturnType<WorkflowExecutionsService['findOne']>>,
  ): Promise<{
    workflowDoc: WorkflowDocument | null;
    unavailableMessage: string;
  }> {
    let unavailableMessage = `Workflow ${jobData.workflowId} not found for delay resume`;
    if (!delayedExecution) {
      return { unavailableMessage, workflowDoc: null };
    }
    try {
      const workflowDoc = await this.documentService.findPinnedWorkflow(
        jobData.workflowId,
        delayedExecution.workflowVersionId,
        jobData.organizationId,
        delayedExecution.userId,
      );
      return { unavailableMessage, workflowDoc };
    } catch (error) {
      if (!(error instanceof RetiredWorkflowExecutionError)) {
        throw error;
      }
      unavailableMessage = error.message;
      return { unavailableMessage, workflowDoc: null };
    }
  }

  private async assertResumedAgentScope(
    metadata: Record<string, unknown> | undefined,
    userId: string,
    organizationId: string,
    workflowBrandId: string | null | undefined,
  ): Promise<void> {
    const scope = this.readPersistedAgentScope(
      metadata,
      userId,
      organizationId,
    );
    if (!scope) {
      return;
    }
    if (!this.agentScopeContextService) {
      throw new Error(
        'Agent scope validator is unavailable for delayed workflow execution.',
      );
    }
    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'workflow',
    );
    this.agentScopeContextService.assertResourceBrand(
      scope,
      workflowBrandId,
      'workflow',
    );
  }

  private async finalizeResumedExecution(input: {
    executionId: string;
    finalStatus: WorkflowExecutionStatus;
    result: ExecutionRunResult;
    triggerEvent: TriggerEvent;
    workflowId: string;
    workflowLabel: string;
  }): Promise<void> {
    if (input.finalStatus === WorkflowExecutionStatus.RUNNING) {
      return;
    }
    const completedExecution = await this.finalizer.finalizeExecution({
      completedAt: new Date(),
      executionId: input.executionId,
      finalStatus: input.finalStatus,
      result: input.result,
      workflowId: input.workflowId,
      workflowStatus:
        input.finalStatus === WorkflowExecutionStatus.COMPLETED
          ? WorkflowStatus.COMPLETED
          : WorkflowStatus.FAILED,
    });
    this.progressService.clearEtaPlan(input.executionId);
    await this.progressService.publishWorkflowStatus(
      input.workflowId,
      input.finalStatus === WorkflowExecutionStatus.COMPLETED
        ? 'completed'
        : 'failed',
      input.triggerEvent.userId,
      {
        error:
          input.finalStatus === WorkflowExecutionStatus.FAILED
            ? input.result.error
            : undefined,
        workflowLabel: input.workflowLabel,
      },
    );
    await this.progressService.publishWorkflowTaskUpdate({
      error: input.result.error,
      eta: this.progressService.extractEtaFromMetadata(
        completedExecution?.metadata,
      ),
      executionId: input.executionId,
      progress: 100,
      resultId: input.executionId,
      status:
        input.finalStatus === WorkflowExecutionStatus.COMPLETED
          ? 'completed'
          : 'failed',
      userId: input.triggerEvent.userId,
      workflowId: input.workflowId,
      workflowLabel: input.workflowLabel,
    });
  }

  private readPersistedAgentScope(
    metadata: Record<string, unknown> | undefined,
    userId: string,
    organizationId: string,
  ): ValidatedAgentScope | undefined {
    const value = metadata?.agentScope;
    if (value === undefined) return undefined;
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
      ![
        'explicit',
        'thread_created',
        'legacy_execution_policy',
        'legacy_message_history',
        'legacy_organization_only',
      ].includes(String(source))
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
      source: source as ValidatedAgentScope['source'],
      threadId: scope.threadId,
      userId,
    };
  }

  async failUnavailablePinnedExecution(input: {
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
