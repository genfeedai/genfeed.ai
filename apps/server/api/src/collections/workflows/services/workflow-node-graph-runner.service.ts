import { randomUUID } from 'node:crypto';
import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import { MAX_EXECUTION_NODES } from '@api/collections/workflows/services/workflow-executor.constants';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import {
  type WorkflowNodeClaimLease,
  WorkflowNodeClaimLeaseLostError,
  WorkflowNodeClaimService,
} from '@api/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeGraphRuntimeService } from '@api/collections/workflows/services/workflow-node-graph-runtime.service';
import { WorkflowNodeProgressTrackerService } from '@api/collections/workflows/services/workflow-node-progress-tracker.service';
import { WorkflowReviewGateService } from '@api/collections/workflows/services/workflow-review-gate.service';
import {
  claimNodeOnce,
  completeNodeClaim,
} from '@api/collections/workflows/utils/workflow-node-idempotency.util';
import { getActionDefinition } from '@genfeedai/actions';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionRunResult,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import {
  getExecutableNodeOperationId,
  planPartialExecution,
} from '@genfeedai/workflows/engine';

type GraphRunOptions = {
  baselineEstimatedDurationMs?: number;
  nodeOutputCache?: Record<string, unknown>;
  respectLocks?: boolean;
  selectedNodeIds?: string[];
  startedAt: Date;
  workflowLabel: string;
};

type GraphExecutionState = {
  completedNodes: Set<string>;
  executionError?: string;
  executionId: string;
  executionOrder: string[];
  executionStatus: 'completed' | 'failed';
  nodeCache: Map<string, unknown>;
  nodeResults: Map<string, NodeExecutionResult>;
  options: GraphRunOptions;
  ownedClaimKeys: Set<string>;
  skippedNodes: Set<string>;
  startedAt: Date;
  totalCreditsUsed: number;
  triggerEvent: TriggerEvent;
  workflow: ExecutableWorkflow;
};

type GraphNodeStep =
  | { kind: 'continue' }
  | { kind: 'break' }
  | { kind: 'return'; result: ExecutionRunResult };

type ClaimedGraphNode = {
  claim: ReturnType<typeof claimNodeOnce>;
  durableLease?: WorkflowNodeClaimLease;
};

export class WorkflowNodeGraphRunnerService {
  private readonly runtimeService: WorkflowNodeGraphRuntimeService;
  /**
   * Process-local claim map for nodes currently executing in this process.
   * Claims are released when the graph pass settles; durable node claims and
   * persisted node results own retry/resume idempotency across graph passes.
   */
  private readonly nodeClaims = new Map<
    string,
    {
      nodeId: string;
      status: 'completed' | 'failed' | 'running' | 'pending';
      output?: unknown;
      error?: string;
    }
  >();

  constructor(
    private readonly engineAdapter: WorkflowEngineAdapterService,
    private readonly graphService: WorkflowExecutionGraphService,
    private readonly progressService: WorkflowExecutionProgressService,
    private readonly nodeProgressTracker: WorkflowNodeProgressTrackerService,
    private readonly reviewGateService: WorkflowReviewGateService,
    private readonly executionsService?: WorkflowExecutionsService,
    private readonly nodeClaimService?: WorkflowNodeClaimService,
    private readonly nodeContinuationService?: WorkflowNodeContinuationService,
  ) {
    this.runtimeService = new WorkflowNodeGraphRuntimeService(
      this.engineAdapter,
      this.graphService,
      this.progressService,
      this.executionsService,
    );
  }

  async executeNodeGraph(
    workflow: ExecutableWorkflow,
    triggerEvent: TriggerEvent,
    executionId: string,
    options: GraphRunOptions,
  ): Promise<ExecutionRunResult> {
    const ownedClaimKeys = new Set<string>();
    try {
      return await this.executeNodeGraphInternal(
        workflow,
        triggerEvent,
        executionId,
        options,
        ownedClaimKeys,
      );
    } finally {
      this.releaseOwnedClaims(ownedClaimKeys);
    }
  }

  private async executeNodeGraphInternal(
    workflow: ExecutableWorkflow,
    triggerEvent: TriggerEvent,
    executionId: string,
    options: GraphRunOptions,
    ownedClaimKeys: Set<string>,
  ): Promise<ExecutionRunResult> {
    const initialized = await this.initializeGraphExecution({
      executionId,
      options,
      ownedClaimKeys,
      triggerEvent,
      workflow,
    });
    if (initialized.kind === 'return') {
      return initialized.result;
    }
    const state = initialized.state;
    for (const nodeId of state.executionOrder) {
      const step = await this.executeGraphNode(state, nodeId);
      if (step.kind === 'return') return step.result;
      if (step.kind === 'break') break;
    }
    return this.finalizeGraphExecution(state);
  }

  private async initializeGraphExecution(input: {
    executionId: string;
    options: GraphRunOptions;
    ownedClaimKeys: Set<string>;
    triggerEvent: TriggerEvent;
    workflow: ExecutableWorkflow;
  }): Promise<
    | { kind: 'ready'; state: GraphExecutionState }
    | { kind: 'return'; result: ExecutionRunResult }
  > {
    const { executionId, options, ownedClaimKeys, triggerEvent, workflow } =
      input;
    const state: GraphExecutionState = {
      completedNodes: new Set<string>(),
      executionId,
      executionOrder: this.graphService.topologicalSort(
        workflow.nodes,
        workflow.edges,
      ),
      executionStatus: 'completed',
      nodeCache: new Map<string, unknown>(),
      nodeResults: new Map<string, NodeExecutionResult>(),
      options,
      ownedClaimKeys,
      skippedNodes: new Set<string>(),
      startedAt: options.startedAt,
      totalCreditsUsed: 0,
      triggerEvent,
      workflow,
    };
    for (const [nodeId, output] of Object.entries(
      options.nodeOutputCache ?? {},
    )) {
      state.completedNodes.add(nodeId);
      state.nodeCache.set(nodeId, output);
      state.nodeResults.set(nodeId, {
        completedAt: state.startedAt,
        creditsUsed: 0,
        nodeId,
        output,
        retryCount: 0,
        startedAt: state.startedAt,
        status: 'completed',
      });
    }
    state.totalCreditsUsed +=
      await this.runtimeService.hydrateCompletedNodesFromExecution(
        executionId,
        state.nodeCache,
        state.nodeResults,
        state.completedNodes,
      );
    this.restorePersistedGraphBranches(state);
    await this.nodeProgressTracker.injectTriggerNode({
      completedNodes: state.completedNodes,
      executionId,
      nodeCache: state.nodeCache,
      nodeResults: state.nodeResults,
      options,
      skippedNodes: state.skippedNodes,
      startedAt: state.startedAt,
      triggerEvent,
      workflow,
    });
    if (options.respectLocks !== false) {
      this.prepopulateLockedNodes(
        workflow,
        state.nodeCache,
        state.completedNodes,
      );
    }
    if (options.selectedNodeIds && options.selectedNodeIds.length > 0) {
      const partialPlan = planPartialExecution(
        options.selectedNodeIds,
        workflow.nodes,
        workflow.edges,
        state.nodeCache,
      );
      if (!partialPlan.isValid) {
        return {
          kind: 'return',
          result: {
            completedAt: new Date(),
            error: partialPlan.errors.join('; '),
            nodeResults: state.nodeResults,
            runId: executionId,
            startedAt: state.startedAt,
            status: 'failed',
            totalCreditsUsed: state.totalCreditsUsed,
            workflowId: workflow.id,
          },
        };
      }
      state.executionOrder = partialPlan.executionOrder;
    }
    return { kind: 'ready', state };
  }

  private restorePersistedGraphBranches(state: GraphExecutionState): void {
    for (const completedNodeId of state.completedNodes) {
      this.graphService.pruneFailurePathAfterSuccess(
        completedNodeId,
        state.workflow.edges,
        state.skippedNodes,
        state.completedNodes,
      );
      const completedNode = state.workflow.nodes.find(
        (node) => node.id === completedNodeId,
      );
      if (completedNode?.type === 'condition') {
        this.graphService.pruneUnreachablePaths(
          completedNodeId,
          this.graphService.extractBranch(state.nodeCache.get(completedNodeId)),
          state.workflow.edges,
          state.skippedNodes,
          state.completedNodes,
        );
      }
    }
    for (const [failedNodeId, failedResult] of state.nodeResults) {
      if (failedResult.status !== 'failed') continue;
      this.resolveFailedNode({
        completedNodes: state.completedNodes,
        edges: state.workflow.edges,
        error: failedResult.error ?? `Node ${failedNodeId} failed`,
        nodeCache: state.nodeCache,
        nodeId: failedNodeId,
        skippedNodes: state.skippedNodes,
      });
    }
  }

  private async executeGraphNode(
    state: GraphExecutionState,
    nodeId: string,
  ): Promise<GraphNodeStep> {
    if (state.completedNodes.has(nodeId) || state.skippedNodes.has(nodeId)) {
      return { kind: 'continue' };
    }
    const node = state.workflow.nodes.find(
      (candidate) => candidate.id === nodeId,
    );
    if (!node) {
      return this.failGraphPass(state, `Node ${nodeId} not found in workflow`);
    }
    if (
      !this.graphService.isNodeReachable(
        nodeId,
        state.workflow.edges,
        state.completedNodes,
        state.skippedNodes,
      )
    ) {
      state.skippedNodes.add(nodeId);
      return { kind: 'continue' };
    }
    if (!this.areNodeDependenciesReady(state, nodeId)) {
      return this.failGraphPass(
        state,
        `Dependencies not satisfied for node ${nodeId}`,
      );
    }
    if (
      state.completedNodes.size + state.skippedNodes.size >
      MAX_EXECUTION_NODES
    ) {
      return this.failGraphPass(state, 'Maximum execution node limit reached');
    }
    const inputs = this.graphService.gatherInputs(
      node,
      state.workflow.edges,
      state.nodeCache,
    );
    if (node.type === 'reviewGate') {
      const pausedResult = await this.reviewGateService.pauseForReviewGate({
        completedNodes: state.completedNodes,
        executionId: state.executionId,
        inputs,
        node,
        nodeResults: state.nodeResults,
        options: state.options,
        skippedNodes: state.skippedNodes,
        startedAt: state.startedAt,
        totalCreditsUsed: state.totalCreditsUsed,
        userId: state.triggerEvent.userId,
        workflow: state.workflow,
      });
      if (pausedResult) return { kind: 'return', result: pausedResult };
    }
    const claimed = await this.claimGraphNode(state, node);
    if ('kind' in claimed) return claimed;
    await this.nodeProgressTracker.trackNodeStarted({
      completedNodes: state.completedNodes,
      executionId: state.executionId,
      node,
      options: state.options,
      skippedNodes: state.skippedNodes,
      startedAt: state.startedAt,
      triggerEvent: state.triggerEvent,
      workflow: state.workflow,
    });
    return this.runClaimedNode(state, node, inputs, claimed);
  }

  private areNodeDependenciesReady(
    state: GraphExecutionState,
    nodeId: string,
  ): boolean {
    if (
      this.graphService.areDependenciesSatisfied(
        nodeId,
        state.workflow.edges,
        state.completedNodes,
        state.nodeCache,
        state.skippedNodes,
      )
    ) {
      return true;
    }
    return this.graphService
      .getNodeDependencies(nodeId, state.workflow.edges)
      .every(
        (dependencyId) =>
          state.completedNodes.has(dependencyId) ||
          state.skippedNodes.has(dependencyId),
      );
  }

  private async claimGraphNode(
    state: GraphExecutionState,
    node: ExecutableNode,
  ): Promise<ClaimedGraphNode | GraphNodeStep> {
    const durable = await this.claimDurableNode(state, node);
    if ('kind' in durable) return durable;
    const claim = claimNodeOnce(this.nodeClaims, state.executionId, node.id);
    if (claim.action === 'skip' && claim.record) {
      this.applyClaimedNodeResult(state, node.id, {
        error: claim.record.error,
        output: claim.record.output,
        status: claim.record.status,
      });
      return { kind: 'continue' };
    }
    if (claim.action === 'busy') {
      return this.failGraphPass(
        state,
        `Node ${node.id} is already running (idempotency claim busy)`,
      );
    }
    state.ownedClaimKeys.add(claim.key);
    return { claim, durableLease: durable.lease };
  }

  private async claimDurableNode(
    state: GraphExecutionState,
    node: ExecutableNode,
  ): Promise<{ lease?: WorkflowNodeClaimLease } | GraphNodeStep> {
    if (!this.nodeClaimService || !state.workflow.organizationId) {
      return {};
    }
    const actionId = getExecutableNodeOperationId(node);
    const action = getActionDefinition(actionId);
    const durable = await this.nodeClaimService.tryClaim({
      executionId: state.executionId,
      nodeId: node.id,
      organizationId: state.workflow.organizationId,
      isStaleRunningReclaimEnabled:
        action?.completionMode !== 'provider-callback',
    });
    if (durable.action !== 'skip') {
      return { lease: durable.lease };
    }
    if (durable.status === 'running') {
      const ownsSuspension =
        action?.completionMode === 'provider-callback' &&
        this.nodeContinuationService &&
        (await this.nodeContinuationService.ownsSuspendedNode({
          actionId,
          executionId: state.executionId,
          nodeId: node.id,
          organizationId: state.workflow.organizationId,
          workflowVersionId: state.workflow.versionId,
        }));
      if (ownsSuspension) {
        return { kind: 'return', result: this.buildRunningResult(state) };
      }
      return this.failGraphPass(
        state,
        `Node ${node.id} is already running (durable claim busy)`,
      );
    }
    this.applyClaimedNodeResult(state, node.id, durable);
    return { kind: 'continue' };
  }

  private applyClaimedNodeResult(
    state: GraphExecutionState,
    nodeId: string,
    claimed: { error?: string; output?: unknown; status: string },
  ): void {
    const result: NodeExecutionResult = {
      completedAt: new Date(),
      creditsUsed: 0,
      error: claimed.error,
      nodeId,
      output: claimed.output,
      retryCount: 0,
      startedAt: new Date(),
      status: claimed.status === 'failed' ? 'failed' : 'completed',
    };
    state.nodeResults.set(nodeId, result);
    if (result.status === 'completed') {
      state.completedNodes.add(nodeId);
      if (result.output !== undefined) {
        state.nodeCache.set(nodeId, result.output);
      }
      this.graphService.pruneFailurePathAfterSuccess(
        nodeId,
        state.workflow.edges,
        state.skippedNodes,
        state.completedNodes,
      );
      return;
    }
    this.resolveFailedNode({
      completedNodes: state.completedNodes,
      edges: state.workflow.edges,
      error: result.error ?? `Node ${nodeId} failed`,
      nodeCache: state.nodeCache,
      nodeId,
      skippedNodes: state.skippedNodes,
    });
  }

  private async runClaimedNode(
    state: GraphExecutionState,
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    claimed: ClaimedGraphNode,
  ): Promise<GraphNodeStep> {
    try {
      const executeNode = (signal?: AbortSignal) =>
        runWithWorkflowAccounting(
          {
            organizationId: state.workflow.organizationId,
            workflowExecutionId: state.executionId,
            workflowNodeId: node.id,
            workflowOperationId: randomUUID(),
          },
          () =>
            this.runtimeService.executeSingleNode(
              node,
              inputs,
              state.workflow,
              state.executionId,
              signal,
            ),
        );
      const initialResult =
        this.nodeClaimService && claimed.durableLease
          ? await this.nodeClaimService.runWithLeaseHeartbeat(
              claimed.durableLease,
              (signal) => executeNode(signal),
            )
          : await executeNode();
      const settled = await this.settleNodeContinuation(
        state,
        node,
        initialResult,
      );
      if (settled.kind === 'return') return settled;
      await this.completeGraphNodeClaims(
        state,
        node.id,
        claimed,
        settled.nodeResult,
        settled.inlineContinuationId,
      );
      state.nodeResults.set(node.id, settled.nodeResult);
      state.totalCreditsUsed += settled.nodeResult.creditsUsed;
      return settled.nodeResult.status === 'completed'
        ? this.applyCompletedNode(state, node, settled.nodeResult)
        : this.applyFailedNode(state, node, settled.nodeResult);
    } catch (error) {
      await this.failClaimedNode(state, node, claimed, error);
      return { kind: 'continue' };
    }
  }

  private async settleNodeContinuation(
    state: GraphExecutionState,
    node: ExecutableNode,
    initialResult: NodeExecutionResult,
  ): Promise<
    | { kind: 'return'; result: ExecutionRunResult }
    | {
        kind: 'settled';
        inlineContinuationId?: string;
        nodeResult: NodeExecutionResult;
      }
  > {
    const actionId = getExecutableNodeOperationId(node);
    const action = getActionDefinition(actionId);
    if (action?.completionMode !== 'provider-callback') {
      if (initialResult.status === 'running') {
        throw new Error(
          `Synchronous action ${actionId} returned a suspended node result`,
        );
      }
      return { kind: 'settled', nodeResult: initialResult };
    }
    if (initialResult.status !== 'running') {
      throw new Error(
        `Provider-callback action ${actionId} returned without suspending`,
      );
    }
    if (!this.nodeContinuationService) {
      throw new Error(
        `Provider-callback action ${actionId} has no continuation service`,
      );
    }
    const attached = await this.nodeContinuationService.attachInitialOutput({
      actionId,
      creditsUsed: initialResult.creditsUsed,
      executionId: state.executionId,
      initialOutput: initialResult.output,
      nodeId: node.id,
      organizationId: state.workflow.organizationId,
      workflowVersionId: state.workflow.versionId,
    });
    if (attached.kind === 'waiting') {
      state.nodeResults.set(node.id, initialResult);
      state.totalCreditsUsed += initialResult.creditsUsed;
      await this.progressService.trackNodeResult(
        state.executionId,
        node.id,
        actionId,
        {
          output: initialResult.output as Record<string, unknown>,
          startedAt: initialResult.startedAt,
          status: WorkflowExecutionStatus.RUNNING,
        },
      );
      return { kind: 'return', result: this.buildRunningResult(state) };
    }
    return {
      inlineContinuationId: attached.continuationId,
      kind: 'settled',
      nodeResult: attached.succeeded
        ? {
            ...initialResult,
            completedAt: new Date(),
            output: attached.finalOutput,
            status: 'completed',
          }
        : {
            ...initialResult,
            completedAt: new Date(),
            error: attached.error ?? 'Provider generation failed',
            output: attached.finalOutput,
            status: 'failed',
          },
    };
  }

  private async completeGraphNodeClaims(
    state: GraphExecutionState,
    nodeId: string,
    claimed: ClaimedGraphNode,
    nodeResult: NodeExecutionResult,
    inlineContinuationId?: string,
  ): Promise<void> {
    completeNodeClaim(this.nodeClaims, claimed.claim.key, {
      error: nodeResult.error,
      output: nodeResult.output,
      status: nodeResult.status === 'failed' ? 'failed' : 'completed',
    });
    if (this.nodeClaimService && state.workflow.organizationId) {
      await this.nodeClaimService.complete({
        error: nodeResult.error,
        executionId: state.executionId,
        leaseOwnerId: claimed.durableLease?.leaseOwnerId,
        nodeId,
        organizationId: state.workflow.organizationId,
        output: nodeResult.output,
        status: nodeResult.status === 'failed' ? 'failed' : 'completed',
      });
    }
    if (inlineContinuationId && this.nodeContinuationService) {
      await this.nodeContinuationService.markSettlementFinished({
        continuationId: inlineContinuationId,
        organizationId: state.workflow.organizationId,
        succeeded: nodeResult.status === 'completed',
      });
    }
  }

  private async applyCompletedNode(
    state: GraphExecutionState,
    node: ExecutableNode,
    nodeResult: NodeExecutionResult,
  ): Promise<GraphNodeStep> {
    state.completedNodes.add(node.id);
    if (nodeResult.output !== undefined) {
      state.nodeCache.set(node.id, nodeResult.output);
    }
    this.graphService.pruneFailurePathAfterSuccess(
      node.id,
      state.workflow.edges,
      state.skippedNodes,
      state.completedNodes,
    );
    if (node.type === 'condition') {
      this.graphService.pruneUnreachablePaths(
        node.id,
        this.graphService.extractBranch(nodeResult.output),
        state.workflow.edges,
        state.skippedNodes,
        state.completedNodes,
      );
    }
    if (node.type === 'delay') {
      const paused = await this.runtimeService.handleDelayNode({
        completedNodes: state.completedNodes,
        executionId: state.executionId,
        executionOrder: state.executionOrder,
        node,
        nodeCache: state.nodeCache,
        nodeId: node.id,
        nodeResult,
        nodeResults: state.nodeResults,
        options: state.options,
        skippedNodes: state.skippedNodes,
        startedAt: state.startedAt,
        totalCreditsUsed: state.totalCreditsUsed,
        triggerEvent: state.triggerEvent,
        workflow: state.workflow,
      });
      if (paused) return { kind: 'return', result: paused };
    }
    await this.nodeProgressTracker.trackNodeCompleted({
      completedNodes: state.completedNodes,
      executionId: state.executionId,
      node,
      nodeId: node.id,
      nodeResult,
      options: state.options,
      skippedNodes: state.skippedNodes,
      startedAt: state.startedAt,
      triggerEvent: state.triggerEvent,
      workflow: state.workflow,
    });
    return { kind: 'continue' };
  }

  private async applyFailedNode(
    state: GraphExecutionState,
    node: ExecutableNode,
    nodeResult: NodeExecutionResult,
  ): Promise<GraphNodeStep> {
    this.resolveFailedNode({
      completedNodes: state.completedNodes,
      edges: state.workflow.edges,
      error: nodeResult.error ?? `Node ${node.id} failed`,
      nodeCache: state.nodeCache,
      nodeId: node.id,
      skippedNodes: state.skippedNodes,
    });
    await this.nodeProgressTracker.trackNodeFailed({
      completedNodes: state.completedNodes,
      errorMessage: nodeResult.error,
      executionId: state.executionId,
      node,
      nodeId: node.id,
      options: state.options,
      skippedNodes: state.skippedNodes,
      startedAt: state.startedAt,
      triggerEvent: state.triggerEvent,
      workflow: state.workflow,
    });
    return { kind: 'continue' };
  }

  private async failClaimedNode(
    state: GraphExecutionState,
    node: ExecutableNode,
    claimed: ClaimedGraphNode,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // When the incoming error already IS a lease-lost signal (raised by
    // `runWithLeaseHeartbeat` or by an earlier `complete()` call in this same
    // pass), this worker no longer owns the claim row: another worker's
    // `tryClaim` already reclaimed it. Writing to it again with our stale
    // `leaseOwnerId` would match 0 rows and throw a second time, escaping
    // before the node is ever recorded as failed (#4307) — skip it and let
    // the new owner settle that row's terminal state instead.
    const isLeaseLost = error instanceof WorkflowNodeClaimLeaseLostError;
    completeNodeClaim(this.nodeClaims, claimed.claim.key, {
      error: errorMessage,
      status: 'failed',
    });
    if (
      !isLeaseLost &&
      this.nodeClaimService &&
      state.workflow.organizationId
    ) {
      await this.nodeClaimService.complete({
        error: errorMessage,
        executionId: state.executionId,
        leaseOwnerId: claimed.durableLease?.leaseOwnerId,
        nodeId: node.id,
        organizationId: state.workflow.organizationId,
        status: 'failed',
      });
    }
    state.nodeResults.set(node.id, {
      completedAt: new Date(),
      creditsUsed: 0,
      error: errorMessage,
      nodeId: node.id,
      retryCount: 0,
      startedAt: new Date(),
      status: 'failed',
    });
    this.resolveFailedNode({
      completedNodes: state.completedNodes,
      edges: state.workflow.edges,
      error: errorMessage,
      nodeCache: state.nodeCache,
      nodeId: node.id,
      skippedNodes: state.skippedNodes,
    });
    await this.nodeProgressTracker.trackNodeFailed({
      completedNodes: state.completedNodes,
      errorMessage,
      executionId: state.executionId,
      node,
      nodeId: node.id,
      options: state.options,
      skippedNodes: state.skippedNodes,
      startedAt: state.startedAt,
      triggerEvent: state.triggerEvent,
      workflow: state.workflow,
    });
  }

  private failGraphPass(
    state: GraphExecutionState,
    message: string,
  ): GraphNodeStep {
    state.executionError = message;
    state.executionStatus = 'failed';
    return { kind: 'break' };
  }

  private buildRunningResult(state: GraphExecutionState): ExecutionRunResult {
    return {
      nodeResults: state.nodeResults,
      runId: state.executionId,
      startedAt: state.startedAt,
      status: 'running',
      totalCreditsUsed: state.totalCreditsUsed,
      workflowId: state.workflow.id,
    };
  }

  private finalizeGraphExecution(
    state: GraphExecutionState,
  ): ExecutionRunResult {
    const failedNodes = [...state.nodeResults.entries()].filter(
      ([, result]) => result.status === 'failed',
    );
    if (failedNodes.length > 0 || state.executionStatus === 'failed') {
      state.executionStatus = 'failed';
      state.executionError ??= `Nodes failed: ${failedNodes
        .map(([id, result]) => (result.error ? `${id}: ${result.error}` : id))
        .join(', ')}`;
    }
    return {
      completedAt: new Date(),
      error: state.executionError,
      nodeResults: state.nodeResults,
      runId: state.executionId,
      startedAt: state.startedAt,
      status: state.executionStatus,
      totalCreditsUsed: state.totalCreditsUsed,
      workflowId: state.workflow.id,
    };
  }
  private releaseOwnedClaims(ownedClaimKeys: Set<string>): void {
    for (const key of ownedClaimKeys) {
      this.nodeClaims.delete(key);
    }
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

  private resolveFailedNode(input: {
    completedNodes: Set<string>;
    edges: ExecutableEdge[];
    error: string;
    nodeCache: Map<string, unknown>;
    nodeId: string;
    skippedNodes: Set<string>;
  }): void {
    const nodeOutputs = Object.fromEntries(input.nodeCache);
    input.completedNodes.add(input.nodeId);
    input.nodeCache.set(input.nodeId, {
      failure: {
        error: input.error,
        failedNodeId: input.nodeId,
        nodeOutputs,
      },
    });
    if (this.graphService.hasFailureEdge(input.nodeId, input.edges)) {
      this.graphService.pruneSuccessPathsAfterFailure(
        input.nodeId,
        input.edges,
        input.skippedNodes,
        input.completedNodes,
      );
      return;
    }
    this.graphService.skipDownstreamNodes(
      input.nodeId,
      input.edges,
      input.skippedNodes,
      input.completedNodes,
    );
  }
}
