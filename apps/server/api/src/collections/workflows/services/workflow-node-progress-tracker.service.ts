import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { findInitialWorkflowTriggerNode } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import {
  type ExecutableNode,
  type ExecutableWorkflow,
  getExecutableNodeOperationId,
  type NodeExecutionResult,
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
  ) {}

  async injectTriggerNode(
    input: ProgressTrackingContext & {
      nodeCache: Map<string, unknown>;
      nodeResults: Map<string, NodeExecutionResult>;
    },
  ): Promise<void> {
    const triggerNode = findInitialWorkflowTriggerNode(
      input.workflow,
      input.triggerEvent.type,
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

    await this.progressService.trackNodeProgress(
      input.executionId,
      input.workflow,
      {
        nodeId: triggerNode.id,
        nodeType: triggerNode.type,
        updates: {
          completedAt: new Date(),
          output: input.triggerEvent.data as Record<string, unknown>,
          startedAt: new Date(),
          status: WorkflowExecutionStatus.COMPLETED,
        },
      },
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Triggered ${triggerNode.label}`,
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
    await this.progressService.trackNodeProgress(
      input.executionId,
      input.workflow,
      {
        nodeId: input.node.id,
        nodeType: getExecutableNodeOperationId(input.node),
        updates: {
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
        },
      },
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Running ${input.node.label}`,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );

    if (input.workflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(input.workflow.id, 'node-started', {
        executionId: input.executionId,
        nodeId: input.node.id,
        nodeType: getExecutableNodeOperationId(input.node),
      });
    }
  }

  async trackNodeCompleted(
    input: ProgressTrackingContext & {
      node: ExecutableNode;
      nodeId: string;
      nodeResult: NodeExecutionResult;
    },
  ): Promise<void> {
    await this.progressService.trackNodeProgress(
      input.executionId,
      input.workflow,
      {
        nodeId: input.nodeId,
        nodeType: getExecutableNodeOperationId(input.node),
        updates: {
          completedAt: new Date(),
          creditsUsed: input.nodeResult.creditsUsed,
          output: input.nodeResult.output as
            | Record<string, unknown>
            | undefined,
          status: WorkflowExecutionStatus.COMPLETED,
        },
      },
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Completed ${input.node.label}`,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );

    if (input.workflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(
        input.workflow.id,
        'node-completed',
        {
          executionId: input.executionId,
          nodeId: input.nodeId,
          nodeType: getExecutableNodeOperationId(input.node),
        },
      );
    }
  }

  async trackNodeFailed(
    input: ProgressTrackingContext & {
      node: ExecutableNode;
      nodeId: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.progressService.trackNodeProgress(
      input.executionId,
      input.workflow,
      {
        nodeId: input.nodeId,
        nodeType: getExecutableNodeOperationId(input.node),
        updates: {
          completedAt: new Date(),
          error: input.errorMessage,
          status: WorkflowExecutionStatus.FAILED,
        },
      },
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: `Failed at ${input.node.label}`,
        error: input.errorMessage,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
        workflowId: input.workflow.id,
        workflowLabel: input.options.workflowLabel,
      },
    );

    if (input.workflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(input.workflow.id, 'node-failed', {
        error: input.errorMessage,
        executionId: input.executionId,
        nodeId: input.nodeId,
        nodeType: getExecutableNodeOperationId(input.node),
      });
    }
  }
}
