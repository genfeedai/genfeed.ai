import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';

export class WorkflowNodeGraphRuntimeService {
  constructor(
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly executionsService?: WorkflowExecutionsService,
  ) {}

  async hydrateCompletedNodesFromExecution(
    executionId: string,
    nodeCache: Map<string, unknown>,
    nodeResults: Map<string, NodeExecutionResult>,
    completedNodes: Set<string>,
  ): Promise<number> {
    if (!this.executionsService) return 0;
    try {
      const execution = await this.executionsService.findOne({
        id: executionId,
      });
      if (!execution) return 0;
      const rawResult =
        execution.result &&
        typeof execution.result === 'object' &&
        !Array.isArray(execution.result)
          ? (execution.result as Record<string, unknown>)
          : {};
      const relationResults = Array.isArray(execution.nodeResults)
        ? execution.nodeResults
        : [];
      const prior =
        relationResults.length > 0
          ? relationResults
          : Array.isArray(rawResult.nodeResults)
            ? rawResult.nodeResults
            : [];
      let hydratedCredits = 0;

      for (const entry of prior) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          continue;
        }
        const row = entry as Record<string, unknown>;
        const nodeId = typeof row.nodeId === 'string' ? row.nodeId : null;
        const status = String(row.status ?? '');
        if (!nodeId) continue;
        const isCompleted =
          status === WorkflowExecutionStatus.COMPLETED ||
          status === 'completed';
        const isFailed =
          status === WorkflowExecutionStatus.FAILED || status === 'failed';
        if (!isCompleted && !isFailed) continue;
        const output = row.output;
        if (isCompleted) completedNodes.add(nodeId);
        if (isCompleted && output !== undefined && !nodeCache.has(nodeId)) {
          nodeCache.set(nodeId, output);
        }
        if (!nodeResults.has(nodeId)) {
          const creditsUsed =
            typeof row.creditsUsed === 'number' ? row.creditsUsed : 0;
          hydratedCredits += creditsUsed;
          nodeResults.set(nodeId, {
            completedAt: new Date(),
            creditsUsed,
            nodeId,
            output,
            retryCount: 0,
            startedAt: new Date(),
            ...(typeof row.error === 'string' ? { error: row.error } : {}),
            status: isFailed ? 'failed' : 'completed',
          });
        }
      }
      return hydratedCredits;
    } catch {
      return 0;
    }
  }

  async handleDelayNode(input: {
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
    if (!delayMeta.requiresDelayedJob || delayMeta.delayMs <= 0) return null;
    const currentIndex = input.executionOrder.indexOf(input.nodeId);
    const remainingNodeIds = input.executionOrder
      .slice(currentIndex + 1)
      .filter(
        (id) => !input.completedNodes.has(id) && !input.skippedNodes.has(id),
      );
    const nodeOutputCache = Object.fromEntries(input.nodeCache);
    const delayJobData: DelayResumeJobData = {
      delayNodeId: input.nodeId,
      executionId: input.executionId,
      nodeOutputCache,
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
    if (input.workflow.emitSharedEvents !== false) {
      await this.progressService.emitEvent(input.workflow.id, 'delayed', {
        delayMs: delayMeta.delayMs,
        delayNodeId: input.nodeId,
        executionId: input.executionId,
        resumeAt: delayMeta.resumeAt,
      });
    }
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

  async executeSingleNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    workflow: ExecutableWorkflow,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<NodeExecutionResult> {
    return this.engineAdapter.executeNode(node, inputs, workflow, {
      abortSignal: signal,
      executionId,
      maxRetries: 3,
    });
  }
}
