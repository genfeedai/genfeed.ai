import { v4 as uuidv4 } from 'uuid';
import type {
  CreditCostConfig,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionOptions,
  ExecutionProgressEvent,
  ExecutionRunResult,
  ExecutionStatus,
  NodeExecutionResult,
  NodeStatusChangeEvent,
  RetryConfig,
} from '../types';
import { DEFAULT_RETRY_CONFIG } from '../types';
import { canExecuteNode, planPartialExecution } from './partial-execution';
import { analyzeForResume, createCacheFromRun } from './resume-handler';
import { withRetry } from './retry-handler';

export type NodeExecutor = (
  node: ExecutableNode,
  inputs: Map<string, unknown>,
  context: ExecutionContext,
) => Promise<unknown>;

export interface ExecutionContext {
  workflowId: string;
  runId: string;
  organizationId: string;
  userId: string;
  executionId?: string;
  abortSignal?: AbortSignal;
}

export interface EngineConfig {
  maxConcurrency: number;
  retryConfig: RetryConfig;
  creditCosts: CreditCostConfig;
  defaultExecutor?: NodeExecutor;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  creditCosts: {},
  maxConcurrency: 3,
  retryConfig: DEFAULT_RETRY_CONFIG,
};

export class WorkflowEngine {
  private executors = new Map<string, NodeExecutor>();
  private config: EngineConfig;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.executors.set(nodeType, executor);
  }

  getExecutor(nodeType: string): NodeExecutor | undefined {
    return this.executors.get(nodeType) ?? this.config.defaultExecutor;
  }

  /**
   * Node types with an explicitly registered executor (excludes the
   * fallback default executor). Used by coverage specs to assert that every
   * canonical node type has a real executor registered.
   */
  getRegisteredNodeTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  async execute(
    workflow: ExecutableWorkflow,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    const runId = uuidv4();
    const startedAt = new Date();
    const nodeResults = new Map<string, NodeExecutionResult>();
    const nodeCache = new Map<string, unknown>();
    let totalCreditsUsed = 0;

    // Pre-populate cache from nodes with cachedOutput (e.g. from resume)
    for (const node of workflow.nodes) {
      if (node.cachedOutput !== undefined) {
        nodeCache.set(node.id, node.cachedOutput);
      }
    }

    const context: ExecutionContext = {
      abortSignal: options.abortSignal,
      executionId: options.executionId,
      organizationId: workflow.organizationId,
      runId,
      userId: workflow.userId,
      workflowId: workflow.id,
    };

    let nodesToExecute: string[];
    let executionOrder: string[];

    if (options.nodeIds && options.nodeIds.length > 0) {
      const plan = planPartialExecution(
        options.nodeIds,
        workflow.nodes,
        workflow.edges,
        nodeCache,
      );

      if (!plan.isValid) {
        return {
          completedAt: new Date(),
          error: plan.errors.join('; '),
          nodeResults,
          runId,
          startedAt,
          status: 'failed',
          totalCreditsUsed: 0,
          workflowId: workflow.id,
        };
      }

      nodesToExecute = plan.nodesToExecute;
      executionOrder = plan.executionOrder;

      for (const node of workflow.nodes) {
        if (node.isLocked && node.cachedOutput !== undefined) {
          nodeCache.set(node.id, node.cachedOutput);
        }
      }
    } else {
      nodesToExecute = workflow.nodes.map((n) => n.id);
      executionOrder = this.topologicalSort(workflow);

      if (options.respectLocks !== false) {
        for (const nodeId of workflow.lockedNodeIds) {
          const node = workflow.nodes.find((n) => n.id === nodeId);
          if (node?.cachedOutput !== undefined) {
            nodeCache.set(nodeId, node.cachedOutput);
            nodeResults.set(nodeId, {
              completedAt: new Date(),
              creditsUsed: 0,
              nodeId,
              output: node.cachedOutput,
              retryCount: 0,
              startedAt,
              status: 'skipped',
            });
          }
        }
      }
    }

    if (options.respectLocks !== false) {
      nodesToExecute = nodesToExecute.filter(
        (id) => !workflow.lockedNodeIds.includes(id) || !nodeCache.has(id),
      );
      executionOrder = executionOrder.filter(
        (id) => !workflow.lockedNodeIds.includes(id) || !nodeCache.has(id),
      );
    }

    if (options.availableCredits !== undefined) {
      const estimatedCredits = this.estimateCredits(
        nodesToExecute
          .map((id) => workflow.nodes.find((n) => n.id === id))
          .filter((n): n is NonNullable<typeof n> => n !== undefined),
      );
      if (estimatedCredits > options.availableCredits) {
        return {
          completedAt: new Date(),
          error: `Insufficient credits: need ${estimatedCredits}, have ${options.availableCredits}`,
          nodeResults,
          runId,
          startedAt,
          status: 'failed',
          totalCreditsUsed: 0,
          workflowId: workflow.id,
        };
      }
    }

    if (options.dryRun) {
      return {
        completedAt: new Date(),
        nodeResults,
        runId,
        startedAt,
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: workflow.id,
      };
    }

    const completedNodes = new Set<string>(
      Array.from(nodeResults.entries())
        .filter(([_, r]) => r.status === 'completed' || r.status === 'skipped')
        .map(([id]) => id),
    );
    const failedNodes = new Set<string>();
    let currentStatus: ExecutionStatus = 'running';
    let lastError: string | undefined;
    let wasAborted = false;

    // Bounded ready-set scheduler. Dispatches nodes in `executionOrder`
    // priority, never running more than `maxConcurrency` at once, and only
    // dispatching a node once `canExecuteNode` confirms its dependencies are
    // satisfied. A cooperative `abortSignal` halts further dispatch and yields
    // a `cancelled` status. With `maxConcurrency` of 1 this degrades to the
    // previous strictly-sequential behavior.
    const maxConcurrency = Math.max(1, this.config.maxConcurrency);
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
      if (currentStatus !== 'failed' && !wasAborted) {
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

          remaining.splice(index, 1);
          const inputs = this.gatherInputs(node, workflow.edges, nodeCache);

          this.emitNodeStatusChange(options, {
            newStatus: 'running',
            nodeId,
            previousStatus: 'pending',
            runId,
            timestamp: new Date(),
            workflowId: workflow.id,
          });

          inFlight.set(
            nodeId,
            this.executeNode(node, inputs, context, options).then((result) => ({
              node,
              nodeId,
              result,
            })),
          );
        }
      }

      if (inFlight.size === 0) {
        if (currentStatus === 'failed' || wasAborted) {
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
          this.emitProgress(options, {
            completedNodes: Array.from(completedNodes),
            currentNodeId: nodeId,
            currentNodeLabel: node.label,
            failedNodes: Array.from(failedNodes),
            progress,
            runId,
            timestamp: new Date(),
            workflowId: workflow.id,
          });

          this.emitNodeStatusChange(options, {
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
        lastError = result.error;
        currentStatus = 'failed';

        this.emitNodeStatusChange(options, {
          error: result.error,
          newStatus: 'failed',
          nodeId,
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
    if (wasAborted) {
      currentStatus = 'cancelled';
    } else if (currentStatus !== 'failed') {
      // Count only nodes that were in the execution list (not pre-skipped locked nodes)
      const executedOrSkipped = nodesToExecute.every((id) =>
        completedNodes.has(id),
      );
      currentStatus = executedOrSkipped ? 'completed' : 'failed';
    }

    return {
      completedAt: new Date(),
      error: lastError,
      nodeResults,
      runId,
      startedAt,
      status: currentStatus,
      totalCreditsUsed,
      workflowId: workflow.id,
    };
  }

  resume(
    workflow: ExecutableWorkflow,
    previousRunResult: ExecutionRunResult,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    const previousRun = {
      completedAt: previousRunResult.completedAt,
      creditsUsed: previousRunResult.totalCreditsUsed,
      error: previousRunResult.error,
      executedNodeIds: Array.from(previousRunResult.nodeResults.keys()),
      failedNodeId: Array.from(previousRunResult.nodeResults.entries()).find(
        ([_, r]) => r.status === 'failed',
      )?.[0],
      nodeResults: Array.from(previousRunResult.nodeResults.values()),
      runId: previousRunResult.runId,
      startedAt: previousRunResult.startedAt,
      status: previousRunResult.status,
    };

    const analysis = analyzeForResume(
      previousRun,
      workflow.nodes,
      workflow.edges,
    );

    if (!analysis.canResume) {
      return Promise.resolve({
        completedAt: new Date(),
        error: analysis.reason ?? 'Cannot resume execution',
        nodeResults: new Map(),
        runId: uuidv4(),
        startedAt: new Date(),
        status: 'failed',
        totalCreditsUsed: 0,
        workflowId: workflow.id,
      });
    }

    const cache = createCacheFromRun(previousRun);

    for (const node of workflow.nodes) {
      if (cache.has(node.id)) {
        node.cachedOutput = cache.get(node.id);
      }
    }

    return this.execute(workflow, {
      ...options,
      nodeIds: analysis.nodesToReExecute,
      resumeFromNodeId: analysis.resumeFromNodeId ?? undefined,
    });
  }

  private async executeNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    context: ExecutionContext,
    options: ExecutionOptions,
  ): Promise<NodeExecutionResult> {
    const startedAt = new Date();
    let retryCount = 0;
    const maxRetries = options.maxRetries ?? this.config.retryConfig.maxRetries;

    const executor = this.getExecutor(node.type);
    if (!executor) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error: `No executor registered for node type: ${node.type}`,
        nodeId: node.id,
        retryCount: 0,
        startedAt,
        status: 'failed',
      };
    }

    try {
      const output = await withRetry(
        () => executor(node, inputs, context),
        { ...this.config.retryConfig, maxRetries },
        (attempt) => {
          retryCount = attempt;
        },
      );

      const creditsUsed = this.config.creditCosts[node.type] ?? 0;

      return {
        completedAt: new Date(),
        creditsUsed,
        nodeId: node.id,
        output,
        retryCount,
        startedAt,
        status: 'completed',
      };
    } catch (error) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error: error instanceof Error ? error.message : String(error),
        nodeId: node.id,
        retryCount,
        startedAt,
        status: 'failed',
      };
    }
  }

  private gatherInputs(
    node: ExecutableNode,
    edges: ExecutableWorkflow['edges'],
    cache: Map<string, unknown>,
  ): Map<string, unknown> {
    const inputs = new Map<string, unknown>();

    for (const edge of edges) {
      if (edge.target === node.id) {
        const sourceOutput = cache.get(edge.source);
        if (sourceOutput !== undefined) {
          const handleKey = edge.targetHandle ?? edge.source;
          const sourceKey = edge.sourceHandle ?? edge.targetHandle;
          if (
            sourceKey &&
            sourceOutput &&
            typeof sourceOutput === 'object' &&
            sourceKey in (sourceOutput as Record<string, unknown>)
          ) {
            inputs.set(
              handleKey,
              (sourceOutput as Record<string, unknown>)[sourceKey],
            );
          } else {
            inputs.set(handleKey, sourceOutput);
          }
        }
      }
    }

    return inputs;
  }

  private topologicalSort(workflow: ExecutableWorkflow): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of workflow.nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of workflow.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      const adj = adjList.get(edge.source) ?? [];
      adj.push(edge.target);
      adjList.set(edge.source, adj);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      result.push(current);

      for (const neighbor of adjList.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  estimateCredits(nodes: ExecutableNode[]): number {
    return nodes.reduce((total, node) => {
      return total + (this.config.creditCosts[node.type] ?? 0);
    }, 0);
  }

  private emitProgress(
    options: ExecutionOptions,
    event: ExecutionProgressEvent,
  ): void {
    if (options.onProgress) {
      try {
        options.onProgress(event);
      } catch {
        /* Ignore callback errors */
      }
    }
  }

  private emitNodeStatusChange(
    options: ExecutionOptions,
    event: NodeStatusChangeEvent,
  ): void {
    if (options.onNodeStatusChange) {
      try {
        options.onNodeStatusChange(event);
      } catch {
        /* Ignore callback errors */
      }
    }
  }
}

export function createWorkflowEngine(
  config?: Partial<EngineConfig>,
): WorkflowEngine {
  return new WorkflowEngine(config);
}
