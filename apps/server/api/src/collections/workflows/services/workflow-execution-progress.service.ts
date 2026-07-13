import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  NodeStatusChangeEvent,
} from '@genfeedai/workflows/engine';
import { buildWorkflowEtaSnapshot } from '@helpers/generation-eta.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { mapEngineNodeStatus } from './workflow-execution-status.util';

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

  constructor(
    private readonly executionsService: WorkflowExecutionsService,
    private readonly logger: LoggerService,
    private readonly websocketService?: NotificationsPublisherService,
  ) {}

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
    const eta = buildWorkflowEtaSnapshot({
      baselineEstimatedDurationMs: options.baselineEstimatedDurationMs,
      completedNodeIds: options.completedNodeIds,
      currentPhase: options.currentPhase,
      edges: workflow.edges,
      nodes: workflow.nodes,
      skippedNodeIds: options.skippedNodeIds,
      startedAt: options.startedAt,
    });

    await this.executionsService.updateExecutionMetadata(executionId, { eta });

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
