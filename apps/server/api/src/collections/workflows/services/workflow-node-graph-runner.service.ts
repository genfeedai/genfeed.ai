import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import { MAX_EXECUTION_NODES } from '@api/collections/workflows/services/workflow-executor.constants';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowNodeProgressTrackerService } from '@api/collections/workflows/services/workflow-node-progress-tracker.service';
import { WorkflowReviewGateService } from '@api/collections/workflows/services/workflow-review-gate.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
} from '@genfeedai/workflow-engine';

export class WorkflowNodeGraphRunnerService {
  constructor(
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly nodeProgressTracker: WorkflowNodeProgressTrackerService,
    private readonly reviewGateService: WorkflowReviewGateService,
  ) {}

  async executeNodeGraph(
    workflow: ExecutableWorkflow,
    triggerEvent: TriggerEvent,
    executionId: string,
    options: {
      baselineEstimatedDurationMs?: number;
      startedAt: Date;
      workflowLabel: string;
    },
  ): Promise<ExecutionRunResult> {
    const executionOrder = this.graphService.topologicalSort(
      workflow.nodes,
      workflow.edges,
    );
    const nodeCache = new Map<string, unknown>();
    const nodeResults = new Map<string, NodeExecutionResult>();
    const completedNodes = new Set<string>();
    const skippedNodes = new Set<string>();
    let totalCreditsUsed = 0;
    const startedAt = options.startedAt;

    await this.nodeProgressTracker.injectTriggerNode({
      completedNodes,
      executionId,
      nodeCache,
      nodeResults,
      options,
      skippedNodes,
      startedAt,
      triggerEvent,
      workflow,
    });
    this.prepopulateLockedNodes(workflow, nodeCache, completedNodes);

    let executionError: string | undefined;
    let executionStatus: 'completed' | 'failed' = 'completed';

    for (const nodeId of executionOrder) {
      if (completedNodes.has(nodeId) || skippedNodes.has(nodeId)) {
        continue;
      }

      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        executionError = `Node ${nodeId} not found in workflow`;
        executionStatus = 'failed';
        break;
      }

      if (
        !this.graphService.isNodeReachable(
          nodeId,
          workflow.edges,
          completedNodes,
          skippedNodes,
        )
      ) {
        skippedNodes.add(nodeId);
        continue;
      }

      if (
        !this.graphService.areDependenciesSatisfied(
          nodeId,
          workflow.edges,
          completedNodes,
          nodeCache,
        )
      ) {
        const deps = this.graphService.getNodeDependencies(
          nodeId,
          workflow.edges,
        );
        const allDepsResolved = deps.every(
          (depId) => completedNodes.has(depId) || skippedNodes.has(depId),
        );

        if (allDepsResolved && deps.some((depId) => skippedNodes.has(depId))) {
          skippedNodes.add(nodeId);
          continue;
        }

        executionError = `Dependencies not satisfied for node ${nodeId}`;
        executionStatus = 'failed';
        break;
      }

      if (completedNodes.size + skippedNodes.size > MAX_EXECUTION_NODES) {
        executionError = 'Maximum execution node limit reached';
        executionStatus = 'failed';
        break;
      }

      const inputs = this.graphService.gatherInputs(
        node,
        workflow.edges,
        nodeCache,
      );

      if (node.type === 'reviewGate') {
        const pausedResult = await this.reviewGateService.pauseForReviewGate({
          completedNodes,
          executionId,
          inputs,
          node,
          nodeResults,
          options,
          skippedNodes,
          startedAt,
          totalCreditsUsed,
          userId: triggerEvent.userId,
          workflow,
        });

        if (pausedResult) {
          return pausedResult;
        }
      }

      await this.nodeProgressTracker.trackNodeStarted({
        completedNodes,
        executionId,
        node,
        options,
        skippedNodes,
        startedAt,
        triggerEvent,
        workflow,
      });

      try {
        const nodeResult = await this.executeSingleNode(
          node,
          inputs,
          workflow,
          executionId,
        );

        nodeResults.set(nodeId, nodeResult);
        totalCreditsUsed += nodeResult.creditsUsed;

        if (nodeResult.status === 'completed') {
          completedNodes.add(nodeId);

          if (nodeResult.output !== undefined) {
            nodeCache.set(nodeId, nodeResult.output);
          }

          if (node.type === 'condition') {
            this.graphService.pruneUnreachablePaths(
              nodeId,
              this.graphService.extractBranch(nodeResult.output),
              workflow.edges,
              skippedNodes,
              completedNodes,
            );
          }

          if (node.type === 'delay') {
            const paused = await this.handleDelayNode({
              completedNodes,
              executionId,
              executionOrder,
              node,
              nodeCache,
              nodeId,
              nodeResult,
              nodeResults,
              options,
              skippedNodes,
              startedAt,
              totalCreditsUsed,
              triggerEvent,
              workflow,
            });
            if (paused) {
              return paused;
            }
          }

          await this.nodeProgressTracker.trackNodeCompleted({
            completedNodes,
            executionId,
            node,
            nodeId,
            nodeResult,
            options,
            skippedNodes,
            startedAt,
            triggerEvent,
            workflow,
          });
        } else {
          await this.nodeProgressTracker.trackNodeFailed({
            completedNodes,
            errorMessage: nodeResult.error,
            executionId,
            node,
            nodeId,
            options,
            skippedNodes,
            startedAt,
            triggerEvent,
            workflow,
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

        await this.nodeProgressTracker.trackNodeFailed({
          completedNodes,
          errorMessage,
          executionId,
          node,
          nodeId,
          options,
          skippedNodes,
          startedAt,
          triggerEvent,
          workflow,
        });
      }
    }

    const hasFailedNodes = Array.from(nodeResults.values()).some(
      (r) => r.status === 'failed',
    );

    if (hasFailedNodes || executionStatus === 'failed') {
      executionStatus = 'failed';
      if (!executionError) {
        const failedNodeIds = Array.from(nodeResults.entries())
          .filter(([, result]) => result.status === 'failed')
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

  private prepopulateLockedNodes(
    workflow: ExecutableWorkflow,
    nodeCache: Map<string, unknown>,
    completedNodes: Set<string>,
  ): void {
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
  }

  private async handleDelayNode(input: {
    workflow: ExecutableWorkflow;
    triggerEvent: TriggerEvent;
    executionId: string;
    executionOrder: string[];
    node: ExecutableNode;
    nodeId: string;
    nodeResult: NodeExecutionResult;
    nodeCache: Map<string, unknown>;
    nodeResults: Map<string, NodeExecutionResult>;
    completedNodes: Set<string>;
    skippedNodes: Set<string>;
    startedAt: Date;
    totalCreditsUsed: number;
    options: {
      baselineEstimatedDurationMs?: number;
      workflowLabel: string;
    };
  }): Promise<
    (ExecutionRunResult & { _delayJobData?: DelayResumeJobData }) | null
  > {
    const delayMeta = this.graphService.extractDelayMetadata(
      input.nodeResult.output,
    );
    if (!delayMeta.requiresDelayedJob || delayMeta.delayMs <= 0) {
      return null;
    }

    const currentIndex = input.executionOrder.indexOf(input.nodeId);
    const remainingNodeIds = input.executionOrder
      .slice(currentIndex + 1)
      .filter(
        (id) => !input.completedNodes.has(id) && !input.skippedNodes.has(id),
      );

    const cacheRecord: Record<string, unknown> = {};
    for (const [key, value] of input.nodeCache) {
      cacheRecord[key] = value;
    }

    const delayJobData: DelayResumeJobData = {
      delayNodeId: input.nodeId,
      executionId: input.executionId,
      nodeOutputCache: cacheRecord,
      organizationId: input.workflow.organizationId,
      remainingNodeIds,
      triggerEvent: input.triggerEvent,
      userId: input.workflow.userId,
      workflowId: input.workflow.id,
    };

    const delayedExecution = await this.progressService.trackNodeResult(
      input.executionId,
      input.nodeId,
      input.node.type,
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

    await this.progressService.emitEvent(input.workflow.id, 'delayed', {
      delayMs: delayMeta.delayMs,
      delayNodeId: input.nodeId,
      executionId: input.executionId,
      resumeAt: delayMeta.resumeAt,
    });

    await this.progressService.updateExecutionEta(
      input.executionId,
      input.workflow,
      {
        baselineEstimatedDurationMs: input.options.baselineEstimatedDurationMs,
        completedNodeIds: input.completedNodes,
        currentPhase: 'Waiting to resume',
        progress: delayedExecution?.progress ?? 0,
        skippedNodeIds: input.skippedNodes,
        startedAt: input.startedAt,
        userId: input.triggerEvent.userId,
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
      _delayJobData: delayJobData,
    };
  }

  private async executeSingleNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    workflow: ExecutableWorkflow,
    executionId: string,
  ): Promise<NodeExecutionResult> {
    const startedAt = new Date();
    const singleNodeWorkflow: ExecutableWorkflow = {
      edges: [],
      id: workflow.id,
      lockedNodeIds: [],
      nodes: [{ ...node, cachedOutput: undefined, isLocked: false }],
      organizationId: workflow.organizationId,
      userId: workflow.userId,
    };

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
      { executionId, maxRetries: 3 },
    );
    const nodeResult = result.nodeResults.get(node.id);

    if (nodeResult) {
      return nodeResult;
    }

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
}
