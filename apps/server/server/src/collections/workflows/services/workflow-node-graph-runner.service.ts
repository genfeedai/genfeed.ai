import { getActionDefinition } from '@genfeedai/actions';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
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
import { WorkflowExecutionsService } from '@server/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionGraphService } from '@server/collections/workflows/services/workflow-execution-graph.service';
import { WorkflowExecutionProgressService } from '@server/collections/workflows/services/workflow-execution-progress.service';
import { MAX_EXECUTION_NODES } from '@server/collections/workflows/services/workflow-executor.constants';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@server/collections/workflows/services/workflow-executor.types';
import { WorkflowNodeClaimService } from '@server/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeContinuationService } from '@server/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeProgressTrackerService } from '@server/collections/workflows/services/workflow-node-progress-tracker.service';
import { WorkflowReviewGateService } from '@server/collections/workflows/services/workflow-review-gate.service';
import {
  claimNodeOnce,
  completeNodeClaim,
} from '@server/collections/workflows/utils/workflow-node-idempotency.util';

export class WorkflowNodeGraphRunnerService {
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
  ) {}

  async executeNodeGraph(
    workflow: ExecutableWorkflow,
    triggerEvent: TriggerEvent,
    executionId: string,
    options: {
      baselineEstimatedDurationMs?: number;
      nodeOutputCache?: Record<string, unknown>;
      respectLocks?: boolean;
      selectedNodeIds?: string[];
      startedAt: Date;
      workflowLabel: string;
    },
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
    options: {
      baselineEstimatedDurationMs?: number;
      nodeOutputCache?: Record<string, unknown>;
      respectLocks?: boolean;
      selectedNodeIds?: string[];
      startedAt: Date;
      workflowLabel: string;
    },
    ownedClaimKeys: Set<string>,
  ): Promise<ExecutionRunResult> {
    let executionOrder = this.graphService.topologicalSort(
      workflow.nodes,
      workflow.edges,
    );
    const nodeCache = new Map<string, unknown>();
    const nodeResults = new Map<string, NodeExecutionResult>();
    const completedNodes = new Set<string>();
    const skippedNodes = new Set<string>();
    let totalCreditsUsed = 0;
    const startedAt = options.startedAt;

    for (const [nodeId, output] of Object.entries(
      options.nodeOutputCache ?? {},
    )) {
      completedNodes.add(nodeId);
      nodeCache.set(nodeId, output);
      nodeResults.set(nodeId, {
        completedAt: startedAt,
        creditsUsed: 0,
        nodeId,
        output,
        retryCount: 0,
        startedAt,
        status: 'completed',
      });
    }

    totalCreditsUsed += await this.hydrateCompletedNodesFromExecution(
      executionId,
      nodeCache,
      nodeResults,
      completedNodes,
    );
    for (const completedNodeId of completedNodes) {
      this.graphService.pruneFailurePathAfterSuccess(
        completedNodeId,
        workflow.edges,
        skippedNodes,
        completedNodes,
      );
      const completedNode = workflow.nodes.find(
        (node) => node.id === completedNodeId,
      );
      if (completedNode?.type === 'condition') {
        this.graphService.pruneUnreachablePaths(
          completedNodeId,
          this.graphService.extractBranch(nodeCache.get(completedNodeId)),
          workflow.edges,
          skippedNodes,
          completedNodes,
        );
      }
    }
    for (const [failedNodeId, failedResult] of nodeResults) {
      if (failedResult.status !== 'failed') {
        continue;
      }
      this.resolveFailedNode({
        completedNodes,
        edges: workflow.edges,
        error: failedResult.error ?? `Node ${failedNodeId} failed`,
        nodeCache,
        nodeId: failedNodeId,
        skippedNodes,
      });
    }

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
    if (options.respectLocks !== false) {
      this.prepopulateLockedNodes(workflow, nodeCache, completedNodes);
    }

    if (options.selectedNodeIds && options.selectedNodeIds.length > 0) {
      const partialPlan = planPartialExecution(
        options.selectedNodeIds,
        workflow.nodes,
        workflow.edges,
        nodeCache,
      );
      if (!partialPlan.isValid) {
        return {
          completedAt: new Date(),
          error: partialPlan.errors.join('; '),
          nodeResults,
          runId: executionId,
          startedAt,
          status: 'failed',
          totalCreditsUsed,
          workflowId: workflow.id,
        };
      }
      executionOrder = partialPlan.executionOrder;
    }

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
          skippedNodes,
        )
      ) {
        const deps = this.graphService.getNodeDependencies(
          nodeId,
          workflow.edges,
        );
        const allDepsResolved = deps.every(
          (depId) => completedNodes.has(depId) || skippedNodes.has(depId),
        );

        if (!allDepsResolved) {
          executionError = `Dependencies not satisfied for node ${nodeId}`;
          executionStatus = 'failed';
          break;
        }
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

      // Per-node claim (#2359): durable unique row first, then process-local
      // map. Duplicate insert / prior completion re-emits instead of re-running
      // side effects (publish, DM, credit spend).
      if (this.nodeClaimService && workflow.organizationId) {
        const actionId = getExecutableNodeOperationId(node);
        const action = getActionDefinition(actionId);
        const durable = await this.nodeClaimService.tryClaim({
          executionId,
          nodeId,
          organizationId: workflow.organizationId,
          // Provider-callback nodes have their own durable continuation lease
          // and may legitimately remain running beyond the synchronous claim
          // window. Their continuation recovery owns that path.
          reclaimStaleRunning: action?.completionMode !== 'provider-callback',
        });
        if (durable.action === 'skip') {
          if (durable.status === 'running') {
            const ownsSuspension =
              action?.completionMode === 'provider-callback' &&
              this.nodeContinuationService &&
              (await this.nodeContinuationService.ownsSuspendedNode({
                actionId,
                executionId,
                nodeId,
                organizationId: workflow.organizationId,
                workflowVersionId: workflow.versionId,
              }));
            if (ownsSuspension) {
              return {
                nodeResults,
                runId: executionId,
                startedAt,
                status: 'running',
                totalCreditsUsed,
                workflowId: workflow.id,
              };
            }
            executionError = `Node ${nodeId} is already running (durable claim busy)`;
            executionStatus = 'failed';
            break;
          }
          const skippedResult: NodeExecutionResult = {
            completedAt: new Date(),
            creditsUsed: 0,
            error: durable.error,
            nodeId,
            output: durable.output,
            retryCount: 0,
            startedAt: new Date(),
            status: durable.status === 'failed' ? 'failed' : 'completed',
          };
          nodeResults.set(nodeId, skippedResult);
          if (skippedResult.status === 'completed') {
            completedNodes.add(nodeId);
            if (skippedResult.output !== undefined) {
              nodeCache.set(nodeId, skippedResult.output);
            }
            this.graphService.pruneFailurePathAfterSuccess(
              nodeId,
              workflow.edges,
              skippedNodes,
              completedNodes,
            );
          } else {
            this.resolveFailedNode({
              completedNodes,
              edges: workflow.edges,
              error: skippedResult.error ?? `Node ${nodeId} failed`,
              nodeCache,
              nodeId,
              skippedNodes,
            });
          }
          continue;
        }
      }

      const claim = claimNodeOnce(this.nodeClaims, executionId, nodeId);
      if (claim.action === 'skip' && claim.record) {
        const skippedResult: NodeExecutionResult = {
          completedAt: new Date(),
          creditsUsed: 0,
          error: claim.record.error,
          nodeId,
          output: claim.record.output,
          retryCount: 0,
          startedAt: new Date(),
          status: claim.record.status === 'failed' ? 'failed' : 'completed',
        };
        nodeResults.set(nodeId, skippedResult);
        if (skippedResult.status === 'completed') {
          completedNodes.add(nodeId);
          if (skippedResult.output !== undefined) {
            nodeCache.set(nodeId, skippedResult.output);
          }
          this.graphService.pruneFailurePathAfterSuccess(
            nodeId,
            workflow.edges,
            skippedNodes,
            completedNodes,
          );
        } else {
          this.resolveFailedNode({
            completedNodes,
            edges: workflow.edges,
            error: skippedResult.error ?? `Node ${nodeId} failed`,
            nodeCache,
            nodeId,
            skippedNodes,
          });
        }
        continue;
      }
      if (claim.action === 'busy') {
        executionError = `Node ${nodeId} is already running (idempotency claim busy)`;
        executionStatus = 'failed';
        break;
      }
      ownedClaimKeys.add(claim.key);

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
        let nodeResult = await this.executeSingleNode(
          node,
          inputs,
          workflow,
          executionId,
        );

        const actionId = getExecutableNodeOperationId(node);
        const action = getActionDefinition(actionId);
        let inlineContinuationId: string | undefined;
        if (action?.completionMode === 'provider-callback') {
          if (nodeResult.status !== 'running') {
            throw new Error(
              `Provider-callback action ${actionId} returned without suspending`,
            );
          }
          if (!this.nodeContinuationService) {
            throw new Error(
              `Provider-callback action ${actionId} has no continuation service`,
            );
          }
          const attached =
            await this.nodeContinuationService.attachInitialOutput({
              actionId,
              creditsUsed: nodeResult.creditsUsed,
              executionId,
              initialOutput: nodeResult.output,
              nodeId,
              organizationId: workflow.organizationId,
              workflowVersionId: workflow.versionId,
            });
          if (attached.kind === 'waiting') {
            nodeResults.set(nodeId, nodeResult);
            totalCreditsUsed += nodeResult.creditsUsed;
            await this.progressService.trackNodeResult(
              executionId,
              nodeId,
              actionId,
              {
                output: nodeResult.output as Record<string, unknown>,
                startedAt: nodeResult.startedAt,
                status: WorkflowExecutionStatus.RUNNING,
              },
            );
            return {
              nodeResults,
              runId: executionId,
              startedAt,
              status: 'running',
              totalCreditsUsed,
              workflowId: workflow.id,
            };
          }

          inlineContinuationId = attached.continuationId;
          nodeResult = attached.succeeded
            ? {
                ...nodeResult,
                completedAt: new Date(),
                output: attached.finalOutput,
                status: 'completed',
              }
            : {
                ...nodeResult,
                completedAt: new Date(),
                error: attached.error ?? 'Provider generation failed',
                output: attached.finalOutput,
                status: 'failed',
              };
        } else if (nodeResult.status === 'running') {
          throw new Error(
            `Synchronous action ${actionId} returned a suspended node result`,
          );
        }

        completeNodeClaim(this.nodeClaims, claim.key, {
          error: nodeResult.error,
          output: nodeResult.output,
          status: nodeResult.status === 'failed' ? 'failed' : 'completed',
        });
        if (this.nodeClaimService && workflow.organizationId) {
          await this.nodeClaimService.complete({
            error: nodeResult.error,
            executionId,
            nodeId,
            organizationId: workflow.organizationId,
            output: nodeResult.output,
            status: nodeResult.status === 'failed' ? 'failed' : 'completed',
          });
        }
        if (inlineContinuationId && this.nodeContinuationService) {
          await this.nodeContinuationService.markSettlementFinished({
            continuationId: inlineContinuationId,
            organizationId: workflow.organizationId,
            succeeded: nodeResult.status === 'completed',
          });
        }

        nodeResults.set(nodeId, nodeResult);
        totalCreditsUsed += nodeResult.creditsUsed;

        if (nodeResult.status === 'completed') {
          completedNodes.add(nodeId);

          if (nodeResult.output !== undefined) {
            nodeCache.set(nodeId, nodeResult.output);
          }

          this.graphService.pruneFailurePathAfterSuccess(
            nodeId,
            workflow.edges,
            skippedNodes,
            completedNodes,
          );

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
          this.resolveFailedNode({
            completedNodes,
            edges: workflow.edges,
            error: nodeResult.error ?? `Node ${nodeId} failed`,
            nodeCache,
            nodeId,
            skippedNodes,
          });
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

        completeNodeClaim(this.nodeClaims, claim.key, {
          error: errorMessage,
          status: 'failed',
        });
        if (this.nodeClaimService && workflow.organizationId) {
          await this.nodeClaimService.complete({
            error: errorMessage,
            executionId,
            nodeId,
            organizationId: workflow.organizationId,
            status: 'failed',
          });
        }

        nodeResults.set(nodeId, {
          completedAt: new Date(),
          creditsUsed: 0,
          error: errorMessage,
          nodeId,
          retryCount: 0,
          startedAt: new Date(),
          status: 'failed',
        });

        this.resolveFailedNode({
          completedNodes,
          edges: workflow.edges,
          error: errorMessage,
          nodeCache,
          nodeId,
          skippedNodes,
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
        const failedNodes = Array.from(nodeResults.entries())
          .filter(([, result]) => result.status === 'failed')
          .map(([id, result]) =>
            result.error ? `${id}: ${result.error}` : id,
          );
        executionError = `Nodes failed: ${failedNodes.join(', ')}`;
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

  /**
   * Re-load durable completed node outputs so a job retry of the same
   * executionId skips side-effect nodes that already landed (#2359).
   */
  private async hydrateCompletedNodesFromExecution(
    executionId: string,
    nodeCache: Map<string, unknown>,
    nodeResults: Map<string, NodeExecutionResult>,
    completedNodes: Set<string>,
  ): Promise<number> {
    if (!this.executionsService) {
      return 0;
    }

    try {
      const execution = await this.executionsService.findOne({
        id: executionId,
      });
      if (!execution) {
        return 0;
      }

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
        if (!nodeId) {
          continue;
        }
        const isCompleted =
          status === WorkflowExecutionStatus.COMPLETED ||
          status === 'completed';
        const isFailed =
          status === WorkflowExecutionStatus.FAILED || status === 'failed';
        if (!isCompleted && !isFailed) {
          continue;
        }

        const output = row.output;
        if (isCompleted) {
          completedNodes.add(nodeId);
        }
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
      // Hydration is best-effort — missing prior progress falls through to a
      // normal run rather than blocking the workflow.
      return 0;
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
      versionId: workflow.versionId,
    };

    const virtualEdges: ExecutableEdge[] = [];
    for (const [key, value] of inputs) {
      const virtualNodeId = `__input_${key}`;
      singleNodeWorkflow.nodes.unshift({
        cachedOutput: value,
        config: { inputKey: key, inputType: 'json' },
        id: virtualNodeId,
        inputs: [],
        isLocked: true,
        label: `Input: ${key}`,
        type: 'workflowInput',
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
