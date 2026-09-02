import {
  GENFEED_ACTION_NODE_TYPE,
  getActionDefinition,
} from '@genfeedai/actions';
import { v4 as uuidv4 } from 'uuid';
import {
  createVideoGenerationLineage,
  isVideoGenerationNodeType,
  VideoGenerationGateService,
} from '../services/video-generation-gate.service';
import type {
  CreditCostConfig,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionProgressEvent,
  ExecutionRunResult,
  ExecutionStatus,
  NodeExecutionResult,
  NodeStatusChangeEvent,
  RetryConfig,
} from '../types';
import { DEFAULT_RETRY_CONFIG } from '../types';
import { buildActionExecutionInput } from '../utils/action-input';
import {
  getExecutableNodeOperationId,
  isEngineNativeNodeType,
} from '../utils/action-node';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '../validation/action-contract';
import {
  DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
  type EngineExecutionOptions,
  type EvaluateVideoPilotFn,
  type VideoGenerationAcceptance,
  type VideoGenerationGateConfig,
  type VideoGenerationLineage,
} from '../video-generation-lineage';
import { canExecuteNode, planPartialExecution } from './partial-execution';
import { analyzeForResume, createCacheFromRun } from './resume-handler';
import { withRetry } from './retry-handler';
import { topologicalSort } from './topological-sort';

export type NodeExecutor = (
  node: ExecutableNode,
  inputs: Map<string, unknown>,
  context: ExecutionContext,
) => Promise<unknown>;

export interface ExecutionContext {
  workflowId: string;
  workflowVersionId: string;
  runId: string;
  organizationId: string;
  userId: string;
  executionId?: string;
  abortSignal?: AbortSignal;
  videoGenerationLineage?: VideoGenerationLineage;
  videoPilotAcceptance?: VideoGenerationAcceptance;
  evaluateVideoPilot?: EvaluateVideoPilotFn;
}

export interface EngineConfig {
  maxConcurrency: number;
  retryConfig: RetryConfig;
  creditCosts: CreditCostConfig;
  videoGenerationGate?: VideoGenerationGateConfig;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  creditCosts: {},
  maxConcurrency: 3,
  retryConfig: DEFAULT_RETRY_CONFIG,
  videoGenerationGate: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
};

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class WorkflowEngine {
  private readonly actionExecutors = new Map<string, NodeExecutor>();
  private readonly nativeExecutors = new Map<string, NodeExecutor>();
  private config: EngineConfig;
  private readonly videoGenerationGate = new VideoGenerationGateService();

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      ...DEFAULT_ENGINE_CONFIG,
      ...config,
      videoGenerationGate: {
        ...DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        ...config.videoGenerationGate,
      },
    };
  }

  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    const isNative = isEngineNativeNodeType(nodeType);
    const action = isNative ? undefined : getActionDefinition(nodeType);
    if (!isNative && !action) {
      throw new Error(`Cannot register unknown Genfeed action: ${nodeType}`);
    }
    const registry = isNative ? this.nativeExecutors : this.actionExecutors;
    if (registry.has(nodeType)) {
      throw new Error(`Duplicate workflow node executor: ${nodeType}`);
    }
    if (isNative) {
      registry.set(nodeType, executor);
      return;
    }

    if (!action) {
      throw new Error(`Cannot register unknown Genfeed action: ${nodeType}`);
    }
    const contract = compileActionContract(nodeType, {
      inputSchema: action.inputSchema as ActionContractJsonSchema,
      outputSchema: action.outputSchema as ActionContractJsonSchema,
    });
    registry.set(nodeType, async (node, inputs, context) => {
      const provenance = {
        nodeId: node.id,
        runId: context.runId,
        workflowId: context.workflowId,
        workflowVersionId: context.workflowVersionId,
      };
      contract.validateInput(
        buildActionExecutionInput(node.config, inputs),
        provenance,
      );
      const output = await executor(node, inputs, context);
      contract.validateOutput(output, provenance);
      return output;
    });
  }

  getExecutor(nodeType: string): NodeExecutor | undefined {
    if (nodeType === GENFEED_ACTION_NODE_TYPE) {
      return (node, inputs, context) => {
        const resolved = this.resolveActionExecutor(node);
        return resolved.executor(resolved.node, inputs, context);
      };
    }
    if (!isEngineNativeNodeType(nodeType)) {
      return undefined;
    }
    return this.nativeExecutors.get(nodeType);
  }

  /**
   * Node types with an explicitly registered executor (excludes the
   * fallback default executor). Used by coverage specs to assert that every
   * canonical node type has a real executor registered.
   */
  getRegisteredNodeTypes(): string[] {
    return [
      ...this.nativeExecutors.keys(),
      ...(this.actionExecutors.size > 0 ? [GENFEED_ACTION_NODE_TYPE] : []),
    ];
  }

  getRegisteredActionIds(): string[] {
    return [...this.actionExecutors.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  async execute(
    workflow: ExecutableWorkflow,
    options: EngineExecutionOptions = {},
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
      evaluateVideoPilot: options.evaluateVideoPilot,
      executionId: options.executionId,
      organizationId: workflow.organizationId,
      runId,
      userId: workflow.userId,
      videoGenerationLineage: options.videoGenerationLineage,
      videoPilotAcceptance: options.videoPilotAcceptance,
      workflowId: workflow.id,
      workflowVersionId: workflow.versionId,
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
      executionOrder = topologicalSort(workflow.nodes, workflow.edges);

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

    const missingExecutorError = this.validateExecutorCoverage(
      workflow,
      nodesToExecute,
    );
    if (missingExecutorError) {
      return {
        completedAt: new Date(),
        error: missingExecutorError,
        nodeResults,
        runId,
        startedAt,
        status: 'failed',
        totalCreditsUsed: 0,
        workflowId: workflow.id,
      };
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
    let hasSuspendedNode = false;

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
      if (currentStatus !== 'failed' && !wasAborted && !hasSuspendedNode) {
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
            this.runNode(node, inputs, context, options).then((result) => ({
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
      } else if (result.status === 'running') {
        hasSuspendedNode = true;
        this.emitNodeStatusChange(options, {
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
    if (wasAborted) {
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

  resume(
    workflow: ExecutableWorkflow,
    previousRunResult: ExecutionRunResult,
    options: EngineExecutionOptions = {},
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

  async executeNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    workflow: Pick<
      ExecutableWorkflow,
      'id' | 'organizationId' | 'userId' | 'versionId'
    >,
    options: EngineExecutionOptions = {},
  ): Promise<NodeExecutionResult> {
    const context: ExecutionContext = {
      abortSignal: options.abortSignal,
      evaluateVideoPilot: options.evaluateVideoPilot,
      executionId: options.executionId,
      organizationId: workflow.organizationId,
      runId: options.executionId ?? uuidv4(),
      userId: workflow.userId,
      videoGenerationLineage: options.videoGenerationLineage,
      videoPilotAcceptance: options.videoPilotAcceptance,
      workflowId: workflow.id,
      workflowVersionId: workflow.versionId,
    };
    return this.runNode(node, inputs, context, options);
  }

  private async runNode(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    context: ExecutionContext,
    options: EngineExecutionOptions,
  ): Promise<NodeExecutionResult> {
    const startedAt = new Date();
    let retryCount = 0;
    const configuredMaxRetries =
      options.maxRetries ?? this.config.retryConfig.maxRetries;

    let resolved: ReturnType<WorkflowEngine['resolveNodeExecutor']>;
    try {
      resolved = this.resolveNodeExecutor(node);
    } catch (error) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error: error instanceof Error ? error.message : String(error),
        nodeId: node.id,
        retryCount: 0,
        startedAt,
        status: 'failed',
      };
    }
    if (!resolved) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error:
          node.type === GENFEED_ACTION_NODE_TYPE
            ? `No executor registered for Genfeed action: ${String(node.config.actionId)}`
            : `No executor registered for node type: ${node.type}`,
        nodeId: node.id,
        retryCount: 0,
        startedAt,
        status: 'failed',
      };
    }
    const executor = resolved.executor;

    const executionNode = resolved.node;
    const executionType = executionNode.type;
    // A provider-callback action acquires durable submission ownership before
    // crossing the provider boundary. Retrying the executor cannot distinguish
    // "request never left" from "provider accepted, process crashed", so it
    // must never submit a second external job for the same execution node.
    const maxRetries =
      getActionDefinition(executionType)?.completionMode === 'provider-callback'
        ? 0
        : configuredMaxRetries;
    const runWithTransportRetry = (
      gatedNode: ExecutableNode,
      gatedInputs: Map<string, unknown>,
    ): Promise<unknown> =>
      withRetry(
        () => executor(gatedNode, gatedInputs, context),
        { ...this.config.retryConfig, maxRetries },
        (attempt) => {
          retryCount = attempt;
        },
      );

    if (
      isVideoGenerationNodeType(executionType) &&
      !(
        context.executionId &&
        getActionDefinition(executionType)?.completionMode ===
          'provider-callback'
      )
    ) {
      const gateConfig =
        this.config.videoGenerationGate ?? DEFAULT_VIDEO_GENERATION_GATE_CONFIG;
      const gated = await this.videoGenerationGate.execute({
        baseCreditCost: this.config.creditCosts[executionType] ?? 0,
        evaluateVideoPilot: context.evaluateVideoPilot,
        executor: runWithTransportRetry,
        gateConfig,
        inputs,
        lineage:
          context.videoGenerationLineage ??
          createVideoGenerationLineage({
            lineageId: `${context.executionId ?? context.runId}:${node.id}`,
            nodeId: node.id,
            workflowId: context.workflowId,
          }),
        node: executionNode,
        nodeId: node.id,
        startedAt,
        videoPilotAcceptance: context.videoPilotAcceptance,
        workflowId: context.workflowId,
      });

      if (gated.kind === 'result') {
        return this.applyActionCompletionMode(
          executionType,
          context.executionId,
          {
            ...gated.result,
            retryCount,
          },
        );
      }
    }

    try {
      const output = await runWithTransportRetry(executionNode, inputs);

      const creditsUsed = this.config.creditCosts[executionType] ?? 0;

      return this.applyActionCompletionMode(
        executionType,
        context.executionId,
        {
          completedAt: new Date(),
          creditsUsed,
          nodeId: node.id,
          output,
          retryCount,
          startedAt,
          status: 'completed',
        },
      );
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

  private applyActionCompletionMode(
    actionId: string,
    executionId: string | undefined,
    result: NodeExecutionResult,
  ): NodeExecutionResult {
    const action = getActionDefinition(actionId);
    if (
      !executionId ||
      action?.completionMode !== 'provider-callback' ||
      result.status !== 'completed'
    ) {
      return result;
    }

    return {
      ...result,
      completedAt: undefined,
      status: 'running',
    };
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
          // A named source handle that an object output does not carry is a
          // mis-wired multi-output node, so the edge stays closed. A scalar
          // output has no keys to name at all — the editor still stamps a
          // handle id on it, so the whole value is delivered instead.
          if (
            edge.sourceHandle !== undefined &&
            sourceOutput &&
            typeof sourceOutput === 'object' &&
            !(edge.sourceHandle in (sourceOutput as Record<string, unknown>))
          ) {
            continue;
          }
          if (
            sourceKey &&
            sourceOutput &&
            typeof sourceOutput === 'object' &&
            sourceKey in (sourceOutput as Record<string, unknown>)
          ) {
            this.addInput(
              inputs,
              handleKey,
              (sourceOutput as Record<string, unknown>)[sourceKey],
            );
          } else {
            this.addInput(inputs, handleKey, sourceOutput);
          }
        }
      }
    }

    return inputs;
  }

  private addInput(
    inputs: Map<string, unknown>,
    handle: string,
    value: unknown,
  ): void {
    if (!inputs.has(handle)) {
      inputs.set(handle, value);
      return;
    }

    const existing = inputs.get(handle);
    inputs.set(
      handle,
      Array.isArray(existing) ? [...existing, value] : [existing, value],
    );
  }

  estimateCredits(nodes: ExecutableNode[]): number {
    return nodes.reduce(
      (total, node) =>
        total +
        (this.config.creditCosts[getExecutableNodeOperationId(node)] ?? 0),
      0,
    );
  }

  private validateExecutorCoverage(
    workflow: ExecutableWorkflow,
    nodeIds: string[],
  ): string | undefined {
    const missing = nodeIds.flatMap((nodeId) => {
      const node = workflow.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return [`node ${nodeId} is missing from the workflow graph`];
      }

      try {
        return this.resolveNodeExecutor(node)
          ? []
          : [`node ${node.id} has no executor for ${node.type}`];
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
    });

    return missing.length > 0
      ? `Workflow executor coverage failed: ${missing.join('; ')}`
      : undefined;
  }

  private resolveNodeExecutor(
    node: ExecutableNode,
  ): { executor: NodeExecutor; node: ExecutableNode } | null {
    if (node.type === GENFEED_ACTION_NODE_TYPE) {
      return this.resolveActionExecutor(node);
    }
    if (!isEngineNativeNodeType(node.type)) {
      return null;
    }

    const executor = this.nativeExecutors.get(node.type);
    return executor ? { executor, node } : null;
  }

  private resolveActionExecutor(node: ExecutableNode): {
    executor: NodeExecutor;
    node: ExecutableNode;
  } {
    const actionId = node.config.actionId;
    if (typeof actionId !== 'string' || actionId.length === 0) {
      throw new Error('A Genfeed action node requires a non-empty actionId');
    }
    if (!getActionDefinition(actionId)) {
      throw new Error(`Unknown Genfeed action: ${actionId}`);
    }

    const executor = this.actionExecutors.get(actionId);
    if (!executor) {
      throw new Error(`No executor registered for Genfeed action: ${actionId}`);
    }

    const { actionId: _actionId, parameters, ...runtimeConfig } = node.config;
    return {
      executor,
      node: {
        ...node,
        config: { ...readRecord(parameters), ...runtimeConfig },
        type: actionId,
      },
    };
  }

  private emitProgress(
    options: EngineExecutionOptions,
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
    options: EngineExecutionOptions,
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
