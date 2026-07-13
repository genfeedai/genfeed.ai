import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import { EVENT_TYPE_TO_NODE_TYPE } from '@api/collections/workflows/services/workflow-executor.constants';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';

type ProgressTrackingOptions = {
  baselineEstimatedDurationMs?: number;
  workflowLabel: string;
};

type ProgressTrackingContext = {
  workflow: ExecutableWorkflow;
  triggerEvent: TriggerEvent;
  executionId: string;
  completedNodes: Set<string>;
  skippedNodes: Set<string>;
  startedAt: Date;
  options: ProgressTrackingOptions;
};

export class WorkflowNodeProgressTrackerService {
  constructor(
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly graphService: WorkflowExecutionGraphService,
  ) {}

  async injectTriggerNode(
    input: ProgressTrackingContext & {
      nodeCache: Map<string, unknown>;
      nodeResults: Map<string, NodeExecutionResult>;
    },
  ): Promise<void> {
    const triggerNodeType =
      EVENT_TYPE_TO_NODE_TYPE[input.triggerEvent.type] ??
      input.triggerEvent.type;
    const triggerNode = input.workflow.nodes.find(
      (n) => n.type === triggerNodeType,
    );
    if (!triggerNode) {
      return;
    }

    input.nodeCache.set(triggerNode.id, input.triggerEvent.data);
    input.completedNodes.add(triggerNode.id);
    input.nodeResults.set(triggerNode.id, {
      completedAt: new Date(),
      creditsUsed: 0,
      nodeId: triggerNode.id,
      output: input.triggerEvent.data,
      retryCount: 0,
      startedAt: new Date(),
      status: 'completed',
    });

    const trackedExecution = await this.progressService.trackNodeResult(
      input.executionId,
      triggerNode.id,
      triggerNode.type,
      {
        completedAt: new Date(),
        output: input.triggerEvent.data as Record<string, unknown>,
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
      },
    );

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Triggered ${triggerNode.label}`,
        progress: trackedExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );
  }

  async trackNodeStarted(
    input: ProgressTrackingContext & {
      node: ExecutableNode;
    },
  ): Promise<void> {
    const runningExecution = await this.progressService.trackNodeResult(
      input.executionId,
      input.node.id,
      input.node.type,
      {
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      },
    );

    await this.progressService.emitEvent(input.workflow.id, 'node-started', {
      executionId: input.executionId,
      nodeId: input.node.id,
      nodeType: input.node.type,
    });

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Running ${input.node.label}`,
        progress: runningExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );
  }

  async trackNodeCompleted(
    input: ProgressTrackingContext & {
      node: ExecutableNode;
      nodeId: string;
      nodeResult: NodeExecutionResult;
    },
  ): Promise<void> {
    const completedExecution = await this.progressService.trackNodeResult(
      input.executionId,
      input.nodeId,
      input.node.type,
      {
        completedAt: new Date(),
        output: input.nodeResult.output as Record<string, unknown> | undefined,
        status: WorkflowExecutionStatus.COMPLETED,
      },
    );

    await this.progressService.emitEvent(input.workflow.id, 'node-completed', {
      executionId: input.executionId,
      nodeId: input.nodeId,
      nodeType: input.node.type,
    });

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Completed ${input.node.label}`,
        progress: completedExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );
  }

  async trackNodeFailed(
    input: ProgressTrackingContext & {
      node: ExecutableNode;
      nodeId: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    const failedExecution = await this.progressService.trackNodeResult(
      input.executionId,
      input.nodeId,
      input.node.type,
      {
        completedAt: new Date(),
        error: input.errorMessage,
        status: WorkflowExecutionStatus.FAILED,
      },
    );

    await this.progressService.emitEvent(input.workflow.id, 'node-failed', {
      error: input.errorMessage,
      executionId: input.executionId,
      nodeId: input.nodeId,
      nodeType: input.node.type,
    });

    this.graphService.skipDownstreamNodes(
      input.nodeId,
      input.workflow.edges,
      input.skippedNodes,
      input.completedNodes,
    );

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Failed at ${input.node.label}`,
        error: input.errorMessage,
        progress: failedExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );
  }
}
