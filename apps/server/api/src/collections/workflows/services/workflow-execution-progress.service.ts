import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  NodeStatusChangeEvent,
} from '@genfeedai/workflows/engine';
import {
  applyWorkflowEtaProgress,
  precomputeWorkflowEtaPlan,
  type WorkflowEtaPlan,
} from '@helpers/generation-eta.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { mapEngineNodeStatus } from './workflow-execution-status.util';

const ETA_WRITE_MIN_INTERVAL_MS = 1_000;

export interface WorkflowEtaSnapshot {
  currentPhase?: string;
  estimatedDurationMs?: number;
  etaConfidence?: 'low' | 'medium' | 'high';
  lastEtaUpdateAt?: string;
  remainingDurationMs?: number;
  startedAt?: string;
}

export class WorkflowExecutionProgressService {
  private readonly logContext = 'WorkflowExecutorService';
  private readonly etaPlans = new Map<string, WorkflowEtaPlan>();
  private readonly lastEtaWrites = new Map<
    string,
    { at: number; phase?: string; remainingDurationMs?: number }
  >();

  constructor(
    private readonly executionsService: WorkflowExecutionsService,
    private readonly logger: LoggerService,
    private readonly websocketService?: NotificationsPublisherService,
  ) {}

  rememberEtaPlan(executionId: string, plan: WorkflowEtaPlan): void {
    this.etaPlans.set(executionId, plan);
  }

  clearEtaPlan(executionId: string): void {
    this.etaPlans.delete(executionId);
    this.lastEtaWrites.delete(executionId);
  }

  private resolveEtaPlan(
    executionId: string,
    workflow: ExecutableWorkflow,
  ): WorkflowEtaPlan {
    const existing = this.etaPlans.get(executionId);
    if (existing) {
      return existing;
    }

    const plan = precomputeWorkflowEtaPlan(workflow.nodes, workflow.edges);
    this.etaPlans.set(executionId, plan);
    return plan;
  }

  async trackNodeResult(
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
    ReturnType<WorkflowExecutionsService['updateNodeResult']>
  > | null> {
    try {
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

      return await this.executionsService.updateNodeResult(
        executionId,
        nodeResult as Parameters<
          WorkflowExecutionsService['updateNodeResult']
        >[1],
      );
    } catch (error) {
      this.logger.error(
        `${this.logContext} failed to track node result`,
        error,
        { executionId, nodeId },
      );
      return null;
    }
  }

  buildNodeStatusChangeHandler(input: {
    executionId: string;
    workflow: ExecutableWorkflow;
    completedNodeIds: Set<string>;
    skippedNodeIds: Set<string>;
    baselineEstimatedDurationMs?: number;
    startedAt: Date;
    progressFallback: number;
    userId: string;
    workflowId: string;
    workflowLabel: string;
  }): (event: NodeStatusChangeEvent) => Promise<void> {
    return async (changeEvent: NodeStatusChangeEvent) => {
      const node =
        input.workflow.nodes.find(
          (candidate: ExecutableNode) => candidate.id === changeEvent.nodeId,
        ) ?? null;
      const nodeLabel = node?.label ?? changeEvent.nodeId;
      const trackedExecution = await this.trackNodeResult(
        input.executionId,
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
          status: mapEngineNodeStatus(changeEvent.newStatus),
        },
      );

      if (changeEvent.newStatus === 'completed') {
        input.completedNodeIds.add(changeEvent.nodeId);
      } else if (changeEvent.newStatus === 'skipped') {
        input.skippedNodeIds.add(changeEvent.nodeId);
      }

      await this.updateExecutionEta(input.executionId, input.workflow, {
        baselineEstimatedDurationMs: input.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodeIds,
        currentPhase:
          changeEvent.newStatus === 'failed'
            ? `Failed at ${nodeLabel}`
            : changeEvent.newStatus === 'completed'
              ? `Completed ${nodeLabel}`
              : changeEvent.newStatus === 'skipped'
                ? `Skipped ${nodeLabel}`
                : `Running ${nodeLabel}`,
        progress: trackedExecution?.progress ?? input.progressFallback,
        skippedNodeIds: input.skippedNodeIds,
        startedAt: input.startedAt,
        userId: input.userId,
        workflowId: input.workflowId,
        workflowLabel: input.workflowLabel,
      });
    };
  }

  async updateExecutionEta(
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
    const plan = this.resolveEtaPlan(executionId, workflow);
    const eta = applyWorkflowEtaProgress(plan, {
      baselineEstimatedDurationMs:
        options.baselineEstimatedDurationMs ?? plan.estimatedDurationMs,
      completedNodeIds: options.completedNodeIds,
      currentPhase: options.currentPhase,
      skippedNodeIds: options.skippedNodeIds,
      startedAt: options.startedAt,
    });

    if (this.shouldPersistEta(executionId, eta)) {
      await this.executionsService.updateExecutionProgress(executionId, {
        eta,
        progress: options.progress,
      });
      this.lastEtaWrites.set(executionId, {
        at: Date.now(),
        phase: eta.currentPhase,
        remainingDurationMs: eta.remainingDurationMs,
      });
    }

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

  private shouldPersistEta(
    executionId: string,
    eta: WorkflowEtaSnapshot,
  ): boolean {
    const lastWrite = this.lastEtaWrites.get(executionId);
    if (!lastWrite) {
      return true;
    }

    if (eta.currentPhase && eta.currentPhase !== lastWrite.phase) {
      return true;
    }

    if (Date.now() - lastWrite.at < ETA_WRITE_MIN_INTERVAL_MS) {
      return false;
    }

    const remainingDelta = Math.abs(
      (eta.remainingDurationMs ?? 0) - (lastWrite.remainingDurationMs ?? 0),
    );
    return remainingDelta >= 500;
  }

  extractEstimatedDurationMs(
    metadata: Record<string, unknown> | undefined,
  ): number | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }

    const eta = metadata.eta;
    if (!eta || typeof eta !== 'object') {
      return undefined;
    }

    const estimatedDurationMs = (eta as Record<string, unknown>)
      .estimatedDurationMs;
    return typeof estimatedDurationMs === 'number'
      ? estimatedDurationMs
      : undefined;
  }

  extractEtaFromMetadata(
    metadata: Record<string, unknown> | undefined,
  ): WorkflowEtaSnapshot | undefined {
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

  async publishWorkflowTaskUpdate(input: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    eta?: WorkflowEtaSnapshot;
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

  async publishWorkflowStatus(
    workflowId: string,
    status: 'completed' | 'failed',
    userId: string,
    payload: { error?: string; workflowLabel: string },
  ): Promise<void> {
    if (typeof this.websocketService?.publishWorkflowStatus !== 'function') {
      return;
    }

    await this.websocketService.publishWorkflowStatus(
      workflowId,
      status,
      userId,
      payload,
    );
  }

  async emitEvent(
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
      // Ignore websocket errors.
    }
  }
}
