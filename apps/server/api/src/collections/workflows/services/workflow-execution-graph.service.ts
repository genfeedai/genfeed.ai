import type { NodeExecutionSummary } from '@api/collections/workflows/services/workflow-executor.types';
import {
  type ExecutableEdge,
  type ExecutableNode,
  type ExecutionRunResult,
  getExecutableNodeOperationId,
  topologicalSort,
} from '@genfeedai/workflows/engine';
import { mapEngineNodeStatus } from './workflow-execution-status.util';

export const WORKFLOW_FAILURE_EDGE_HANDLE = 'failure';

export class WorkflowExecutionGraphService {
  collectDownstreamNodeIds(
    nodeId: string,
    edges: ExecutableEdge[],
    nodes: ExecutableNode[],
  ): string[] {
    const downstream = new Set<string>();
    const visit = (currentNodeId: string) => {
      for (const edge of edges) {
        if (edge.source !== currentNodeId || downstream.has(edge.target)) {
          continue;
        }

        downstream.add(edge.target);
        visit(edge.target);
      }
    };

    visit(nodeId);

    const order = this.topologicalSort(nodes, edges);
    return order.filter((candidateNodeId) => downstream.has(candidateNodeId));
  }

  topologicalSort(nodes: ExecutableNode[], edges: ExecutableEdge[]): string[] {
    return topologicalSort(nodes, edges);
  }

  gatherInputs(
    node: ExecutableNode,
    edges: ExecutableEdge[],
    cache: Map<string, unknown>,
  ): Map<string, unknown> {
    const inputs = new Map<string, unknown>();

    for (const edge of edges) {
      if (edge.target !== node.id) {
        continue;
      }

      const sourceOutput = cache.get(edge.source);
      if (sourceOutput === undefined) {
        continue;
      }

      const handleKey = edge.targetHandle ?? edge.source;
      const sourceKey = edge.sourceHandle ?? edge.targetHandle;
      if (
        edge.sourceHandle !== undefined &&
        (!sourceOutput ||
          typeof sourceOutput !== 'object' ||
          !(edge.sourceHandle in (sourceOutput as Record<string, unknown>)))
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

    return inputs;
  }

  getNodeDependencies(nodeId: string, edges: ExecutableEdge[]): string[] {
    return edges.filter((e) => e.target === nodeId).map((e) => e.source);
  }

  areDependenciesSatisfied(
    nodeId: string,
    edges: ExecutableEdge[],
    completedNodes: Set<string>,
    cache: Map<string, unknown>,
    skippedNodes: Set<string> = new Set(),
  ): boolean {
    const deps = this.getNodeDependencies(nodeId, edges);
    return deps.every(
      (depId) =>
        completedNodes.has(depId) ||
        cache.has(depId) ||
        skippedNodes.has(depId),
    );
  }

  isNodeReachable(
    nodeId: string,
    edges: ExecutableEdge[],
    completedNodes: Set<string>,
    skippedNodes: Set<string>,
  ): boolean {
    const deps = this.getNodeDependencies(nodeId, edges);
    if (deps.length === 0) {
      return true;
    }

    return deps.some(
      (depId) => completedNodes.has(depId) && !skippedNodes.has(depId),
    );
  }

  extractBranch(output: unknown): string {
    if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      if ('result' in outputObj) {
        return outputObj.result ? 'true' : 'false';
      }
    }
    return 'true';
  }

  pruneUnreachablePaths(
    conditionNodeId: string,
    branch: string,
    edges: ExecutableEdge[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const prunedEdges = edges.filter(
      (e) =>
        e.source === conditionNodeId &&
        e.sourceHandle !== undefined &&
        e.sourceHandle !== branch,
    );

    this.pruneEdges(
      conditionNodeId,
      prunedEdges,
      edges,
      skippedNodes,
      completedNodes,
    );
  }

  hasFailureEdge(nodeId: string, edges: ExecutableEdge[]): boolean {
    return edges.some(
      (edge) =>
        edge.source === nodeId &&
        edge.sourceHandle === WORKFLOW_FAILURE_EDGE_HANDLE,
    );
  }

  pruneFailurePathAfterSuccess(
    nodeId: string,
    edges: ExecutableEdge[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    this.pruneEdges(
      nodeId,
      edges.filter(
        (edge) =>
          edge.source === nodeId &&
          edge.sourceHandle === WORKFLOW_FAILURE_EDGE_HANDLE,
      ),
      edges,
      skippedNodes,
      completedNodes,
    );
  }

  pruneSuccessPathsAfterFailure(
    nodeId: string,
    edges: ExecutableEdge[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    this.pruneEdges(
      nodeId,
      edges.filter(
        (edge) =>
          edge.source === nodeId &&
          edge.sourceHandle !== WORKFLOW_FAILURE_EDGE_HANDLE,
      ),
      edges,
      skippedNodes,
      completedNodes,
    );
  }

  skipDownstreamNodes(
    failedNodeId: string,
    edges: ExecutableEdge[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const toSkip = new Set<string>();
    this.collectAllDownstream(failedNodeId, edges, toSkip, completedNodes);

    for (const nodeId of toSkip) {
      skippedNodes.add(nodeId);
    }
  }

  extractDelayMetadata(output: unknown): {
    requiresDelayedJob: boolean;
    delayMs: number;
    resumeAt: string;
  } {
    if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      return {
        delayMs: (outputObj.delayMs as number) ?? 0,
        requiresDelayedJob:
          outputObj.delayMs !== undefined && (outputObj.delayMs as number) > 0,
        resumeAt: (outputObj.resumeAt as string) ?? new Date().toISOString(),
      };
    }
    return {
      delayMs: 0,
      requiresDelayedJob: false,
      resumeAt: new Date().toISOString(),
    };
  }

  buildNodeSummaries(
    result: ExecutionRunResult,
    nodes: ExecutableNode[],
  ): NodeExecutionSummary[] {
    const summaries: NodeExecutionSummary[] = [];

    for (const [nodeId, nodeResult] of result.nodeResults) {
      const node = nodes.find((n) => n.id === nodeId);
      summaries.push({
        completedAt: nodeResult.completedAt,
        creditsUsed: nodeResult.creditsUsed,
        error: nodeResult.error,
        nodeId,
        nodeType: this.resolveNodeType(node),
        output: nodeResult.output as Record<string, unknown> | undefined,
        retryCount: nodeResult.retryCount,
        startedAt: nodeResult.startedAt,
        status: mapEngineNodeStatus(nodeResult.status),
      });
    }

    return summaries;
  }

  /**
   * Every product operation persists under the same `genfeedAction` envelope,
   * so the wrapper type would stamp every node result identically — the action
   * id is the operation's real identity.
   */
  private resolveNodeType(node: ExecutableNode | undefined): string {
    return node ? getExecutableNodeOperationId(node) : 'unknown';
  }

  findFirstFailedNodeId(result: ExecutionRunResult): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }
    return undefined;
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

  private pruneEdges(
    originNodeId: string,
    prunedEdges: ExecutableEdge[],
    allEdges: ExecutableEdge[],
    skippedNodes: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const nodesToSkip = new Set<string>();
    for (const edge of prunedEdges) {
      const retainsIncomingPath = allEdges.some(
        (candidate) =>
          candidate.target === edge.target &&
          !prunedEdges.includes(candidate) &&
          !skippedNodes.has(candidate.source),
      );
      if (retainsIncomingPath) {
        continue;
      }
      this.collectDownstream(
        edge.target,
        allEdges,
        nodesToSkip,
        completedNodes,
        originNodeId,
      );
    }
    for (const nodeId of nodesToSkip) {
      skippedNodes.add(nodeId);
    }
  }

  private collectDownstream(
    nodeId: string,
    edges: ExecutableEdge[],
    collected: Set<string>,
    completedNodes: Set<string>,
    originConditionNodeId: string,
  ): void {
    if (collected.has(nodeId) || completedNodes.has(nodeId)) {
      return;
    }

    const sources = edges
      .filter((e) => e.target === nodeId)
      .map((e) => e.source);

    const hasNonPrunedSource = sources.some(
      (src) =>
        src !== originConditionNodeId &&
        !collected.has(src) &&
        (completedNodes.has(src) || !collected.has(src)),
    );

    if (hasNonPrunedSource) {
      return;
    }

    collected.add(nodeId);

    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      this.collectDownstream(
        edge.target,
        edges,
        collected,
        completedNodes,
        originConditionNodeId,
      );
    }
  }

  private collectAllDownstream(
    nodeId: string,
    edges: ExecutableEdge[],
    collected: Set<string>,
    completedNodes: Set<string>,
  ): void {
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      if (!collected.has(edge.target) && !completedNodes.has(edge.target)) {
        collected.add(edge.target);
        this.collectAllDownstream(
          edge.target,
          edges,
          collected,
          completedNodes,
        );
      }
    }
  }
}
