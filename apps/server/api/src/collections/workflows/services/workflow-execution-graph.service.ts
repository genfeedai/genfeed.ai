import type { NodeExecutionSummary } from '@api/collections/workflows/services/workflow-executor.types';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutionRunResult,
} from '@genfeedai/workflow-engine';
import { mapEngineNodeStatus } from './workflow-execution-status.util';

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
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of edges) {
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
      if (!current) continue;
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
      if (
        edge.targetHandle &&
        sourceOutput &&
        typeof sourceOutput === 'object' &&
        edge.targetHandle in (sourceOutput as Record<string, unknown>)
      ) {
        inputs.set(
          handleKey,
          (sourceOutput as Record<string, unknown>)[edge.targetHandle],
        );
      } else {
        inputs.set(handleKey, sourceOutput);
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
  ): boolean {
    const deps = this.getNodeDependencies(nodeId, edges);
    return deps.every((depId) => completedNodes.has(depId) || cache.has(depId));
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

    const nodesToSkip = new Set<string>();
    for (const edge of prunedEdges) {
      this.collectDownstream(
        edge.target,
        edges,
        nodesToSkip,
        completedNodes,
        conditionNodeId,
      );
    }

    for (const nodeId of nodesToSkip) {
      skippedNodes.add(nodeId);
    }
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
        nodeType: node?.type ?? 'unknown',
        output: nodeResult.output as Record<string, unknown> | undefined,
        retryCount: nodeResult.retryCount,
        startedAt: nodeResult.startedAt,
        status: mapEngineNodeStatus(nodeResult.status),
      });
    }

    return summaries;
  }

  findFirstFailedNodeId(result: ExecutionRunResult): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }
    return undefined;
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
