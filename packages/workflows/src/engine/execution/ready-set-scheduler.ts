import type {
  CreditCostConfig,
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionProgressEvent,
  ExecutionRunResult,
  ExecutionStatus,
  NodeExecutionResult,
  NodeStatusChangeEvent,
} from '../types';
import type { EngineExecutionOptions } from '../video-generation-lineage';
import type { ExecutionContext } from './engine';
import {
  isFailureControlledNode,
  isWorkflowEdgeActive,
  isWorkflowNodeReachable,
} from './failure-routing';
import { canExecuteNode } from './partial-execution';

interface ReadySetCallbacks {
  gatherInputs(
    node: ExecutableNode,
    edges: ExecutableEdge[],
    cache: Map<string, unknown>,
    results: Map<string, NodeExecutionResult>,
  ): Map<string, unknown>;
  runNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    context: ExecutionContext,
    options: EngineExecutionOptions,
  ): Promise<NodeExecutionResult>;
  emitNodeStatusChange(
    options: EngineExecutionOptions,
    event: NodeStatusChangeEvent,
  ): void;
  emitProgress(
    options: EngineExecutionOptions,
    event: ExecutionProgressEvent,
  ): void;
}
export interface ReadySetInput {
  workflow: ExecutableWorkflow;
  options: EngineExecutionOptions;
  context: ExecutionContext;
  config: { maxConcurrency: number; creditCosts: CreditCostConfig };
  executionOrder: string[];
  nodesToExecute: string[];
  nodeCache: Map<string, unknown>;
  nodeResults: Map<string, NodeExecutionResult>;
  startedAt: Date;
  runId: string;
  totalCreditsUsed: number;
  callbacks: ReadySetCallbacks;
}
export async function runReadySetScheduler(
  input: ReadySetInput,
): Promise<ExecutionRunResult> {
  if (input.options.dryRun) {
    return {
      completedAt: new Date(),
      nodeResults: input.nodeResults,
      runId: input.runId,
      startedAt: input.startedAt,
      status: 'completed',
      totalCreditsUsed: 0,
      workflowId: input.workflow.id,
    };
  }
  const {
    workflow,
    options,
    context,
    config,
    executionOrder,
    nodesToExecute,
    nodeCache,
    nodeResults,
    startedAt,
    runId,
    callbacks,
  } = input;
  let { totalCreditsUsed } = input;
  const completedNodes = new Set<string>(
    Array.from(nodeResults.entries())
      .filter(([_, r]) => r.status === 'completed' || r.status === 'skipped')
      .map(([id]) => id),
  );
  for (const id of nodeCache.keys())
    if (!nodesToExecute.includes(id)) completedNodes.add(id);
  const failedNodes = new Set<string>();
  const skippedNodes = new Set<string>();
  const compensationNodes = new Set<string>();
  let currentStatus: ExecutionStatus = 'running';
  let lastError: string | undefined;
  let wasAborted = false;
  let hasSuspendedNode = false;

  // Bounded ready-set scheduler. Dispatches nodes in `executionOrder`
  // priority, never running more than `maxConcurrency` at once, and only
  // dispatching a node once `canExecuteNode` confirms its dependencies are
  // satisfied. A cooperative `abortSignal` halts further dispatch and yields
  // a `cancelled` status. With `maxConcurrency` of 1 this degrades to the
  // previous strictly-sequential behavior.
  const maxConcurrency = Math.max(1, config.maxConcurrency);
  const remaining = executionOrder.filter(
    (id) => nodesToExecute.includes(id) && !completedNodes.has(id),
  );
  const inFlight = new Map<
    string,
    Promise<{
      node: ExecutableNode;
      nodeId: string;
      result: NodeExecutionResult;
    }>
  >();

  while (inFlight.size > 0 || remaining.length > 0) {
    // Dispatch phase — fill free slots while running and not aborted.
    if (context.abortSignal?.aborted) wasAborted = true;
    if (!wasAborted && !hasSuspendedNode) {
      let index = 0;
      while (index < remaining.length && inFlight.size < maxConcurrency) {
        // Abort is checked before dispatching each node.
        if (context.abortSignal?.aborted) {
          wasAborted = true;
          break;
        }

        const nodeId = remaining[index];
        const node = workflow.nodes.find((n) => n.id === nodeId);
        if (!node) {
          lastError = `Node ${nodeId} not found`;
          currentStatus = 'failed';
          remaining.splice(index, 1);
          break;
        }

        if (
          !canExecuteNode(
            nodeId,
            workflow.nodes,
            workflow.edges,
            completedNodes,
            nodeCache,
          )
        ) {
          // Dependency still in flight — defer this node, try the next one.
          index++;
          continue;
        }

        const reachable = isWorkflowNodeReachable(
          nodeId,
          workflow.edges,
          completedNodes,
          skippedNodes,
          nodeResults,
          node,
        );
        const compensation =
          reachable &&
          (isFailureControlledNode(node, workflow.edges) ||
            workflow.edges.some(
              (edge) =>
                edge.target === nodeId &&
                (compensationNodes.has(edge.source) ||
                  edge.sourceHandle === 'failure') &&
                !skippedNodes.has(edge.source) &&
                isWorkflowEdgeActive(edge, nodeResults),
            ));
        if (!reachable || (currentStatus === 'failed' && !compensation)) {
          remaining.splice(index, 1);
          skippedNodes.add(nodeId);
          completedNodes.add(nodeId);
          nodeResults.set(nodeId, {
            nodeId,
            status: 'skipped',
            creditsUsed: 0,
            retryCount: 0,
            startedAt,
            completedAt: new Date(),
          });
          index = 0;
          continue;
        }
        if (compensation) compensationNodes.add(nodeId);
        remaining.splice(index, 1);
        const inputs = callbacks.gatherInputs(
          node,
          workflow.edges,
          nodeCache,
          nodeResults,
        );

        callbacks.emitNodeStatusChange(options, {
          newStatus: 'running',
          nodeId,
          previousStatus: 'pending',
          runId,
          timestamp: new Date(),
          workflowId: workflow.id,
        });

        inFlight.set(
          nodeId,
          callbacks.runNode(node, inputs, context, options).then((result) => ({
            node,
            nodeId,
            result,
          })),
        );
      }
    }

    if (inFlight.size === 0) {
      if (currentStatus === 'failed' || wasAborted || hasSuspendedNode) {
        break;
      }
      if (remaining.length === 0) {
        break;
      }
      // Nothing in flight and nothing dispatchable: a dependency can never be
      // satisfied. Fail the first stuck node rather than spin forever.
      const stuckNodeId = remaining[0];
      lastError = `Dependencies not satisfied for node ${stuckNodeId}`;
      failedNodes.add(stuckNodeId);
      currentStatus = 'failed';
      break;
    }

    // Wait for the next in-flight node to settle, then record its result.
    // Already-dispatched nodes are always drained even after a failure or
    // abort so their promises never reject unobserved.
    const settled = await Promise.race(inFlight.values());
    inFlight.delete(settled.nodeId);

    const { node, nodeId, result } = settled;
    nodeResults.set(nodeId, result);
    totalCreditsUsed += result.creditsUsed;

    if (result.status === 'completed') {
      completedNodes.add(nodeId);
      if (result.output !== undefined) {
        nodeCache.set(nodeId, result.output);
      }

      // In-flight siblings drained after a failure or abort are still
      // recorded in nodeResults/completedNodes (for observability and cache
      // correctness), but they must not emit user-facing progress/status
      // events on a run that is no longer healthy.
      if (currentStatus !== 'failed' && !wasAborted) {
        const totalNodes = nodesToExecute.length || 1;
        // Only count completed nodes that are in the execution list for progress
        const executedCount = nodesToExecute.filter((id) =>
          completedNodes.has(id),
        ).length;
        const progress = Math.round((executedCount / totalNodes) * 100);
        callbacks.emitProgress(options, {
          completedNodes: Array.from(completedNodes),
          currentNodeId: nodeId,
          currentNodeLabel: node.label,
          failedNodes: Array.from(failedNodes),
          progress,
          runId,
          timestamp: new Date(),
          workflowId: workflow.id,
        });

        callbacks.emitNodeStatusChange(options, {
          newStatus: result.status,
          nodeId,
          output: result.output,
          previousStatus: 'running',
          runId,
          timestamp: new Date(),
          workflowId: workflow.id,
        });
      }
    } else if (result.status === 'failed') {
      failedNodes.add(nodeId);
      lastError ??= result.error;
      currentStatus = 'failed';
      completedNodes.add(nodeId);
      const nodeOutputs = Object.fromEntries(nodeCache);
      nodeCache.set(nodeId, {
        failure: {
          error: result.error ?? `Node ${nodeId} failed`,
          failedNodeId: nodeId,
          nodeOutputs,
        },
      });

      callbacks.emitNodeStatusChange(options, {
        error: result.error,
        newStatus: 'failed',
        nodeId,
        previousStatus: 'running',
        runId,
        timestamp: new Date(),
        workflowId: workflow.id,
      });
    } else if (result.status === 'running') {
      hasSuspendedNode = true;
      callbacks.emitNodeStatusChange(options, {
        newStatus: 'running',
        nodeId,
        output: result.output,
        previousStatus: 'running',
        runId,
        timestamp: new Date(),
        workflowId: workflow.id,
      });
    }
  }

  // Abort takes priority over a concurrent in-flight failure: a run whose
  // signal fired must report `cancelled`, even if a sibling node failed while
  // the already-dispatched work was being drained.
  if (wasAborted || context.abortSignal?.aborted) {
    currentStatus = 'cancelled';
  } else if (hasSuspendedNode) {
    currentStatus = 'running';
  } else if (currentStatus !== 'failed') {
    // Count only nodes that were in the execution list (not pre-skipped locked nodes)
    const executedOrSkipped = nodesToExecute.every((id) =>
      completedNodes.has(id),
    );
    currentStatus = executedOrSkipped ? 'completed' : 'failed';
  }

  return {
    completedAt: currentStatus === 'running' ? undefined : new Date(),
    error: lastError,
    nodeResults,
    runId,
    startedAt,
    status: currentStatus,
    totalCreditsUsed,
    workflowId: workflow.id,
  };
}
