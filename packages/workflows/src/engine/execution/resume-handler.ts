import {
  type PartialExecutionPlan,
  planPartialExecution,
} from '@workflow-engine/execution/partial-execution';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutionRun,
  NodeExecutionStatus,
} from '@workflow-engine/types';

export interface ResumeAnalysis {
  canResume: boolean;
  resumeFromNodeId: string | null;
  completedNodeIds: string[];
  previousOutputs: Map<string, unknown>;
  nodesToReExecute: string[];
  executionPlan: PartialExecutionPlan | null;
  reason?: string;
}

export function analyzeForResume(
  previousRun: ExecutionRun,
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
): ResumeAnalysis {
  if (previousRun.status !== 'failed') {
    return {
      canResume: false,
      completedNodeIds: [],
      executionPlan: null,
      nodesToReExecute: [],
      previousOutputs: new Map(),
      reason: `Cannot resume: run status is ${previousRun.status}, expected 'failed'`,
      resumeFromNodeId: null,
    };
  }

  if (!previousRun.failedNodeId) {
    return {
      canResume: false,
      completedNodeIds: [],
      executionPlan: null,
      nodesToReExecute: [],
      previousOutputs: new Map(),
      reason: 'Cannot resume: no failed node ID recorded',
      resumeFromNodeId: null,
    };
  }

  const failedNode = nodes.find((n) => n.id === previousRun.failedNodeId);
  if (!failedNode) {
    return {
      canResume: false,
      completedNodeIds: [],
      executionPlan: null,
      nodesToReExecute: [],
      previousOutputs: new Map(),
      reason: `Cannot resume: failed node ${previousRun.failedNodeId} no longer exists in workflow`,
      resumeFromNodeId: null,
    };
  }

  const completedNodeIds: string[] = [];
  const previousOutputs = new Map<string, unknown>();

  for (const result of previousRun.nodeResults) {
    if (result.status === 'completed' && result.output !== undefined) {
      completedNodeIds.push(result.nodeId);
      previousOutputs.set(result.nodeId, result.output);
    }
  }

  const nodesToReExecute = findNodesToReExecute(
    previousRun.failedNodeId,
    nodes,
    edges,
  );

  const executionPlan = planPartialExecution(
    nodesToReExecute,
    nodes,
    edges,
    previousOutputs,
  );

  return {
    canResume: executionPlan.isValid,
    completedNodeIds,
    executionPlan,
    nodesToReExecute,
    previousOutputs,
    reason: executionPlan.isValid ? undefined : executionPlan.errors.join('; '),
    resumeFromNodeId: previousRun.failedNodeId,
  };
}

function findNodesToReExecute(
  failedNodeId: string,
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
): string[] {
  const result = new Set<string>();
  result.add(failedNodeId);

  const forwardEdges = new Map<string, string[]>();
  for (const node of nodes) {
    forwardEdges.set(node.id, []);
  }
  for (const edge of edges) {
    const targets = forwardEdges.get(edge.source) ?? [];
    targets.push(edge.target);
    forwardEdges.set(edge.source, targets);
  }

  const queue = [failedNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const downstream of forwardEdges.get(current) ?? []) {
      if (!result.has(downstream)) {
        result.add(downstream);
        queue.push(downstream);
      }
    }
  }

  return Array.from(result);
}

export function createCacheFromRun(
  previousRun: ExecutionRun,
): Map<string, unknown> {
  const cache = new Map<string, unknown>();

  for (const result of previousRun.nodeResults) {
    if (result.status === 'completed' && result.output !== undefined) {
      cache.set(result.nodeId, result.output);
    }
  }

  return cache;
}

export function mergeExecutionResults(
  previousRun: ExecutionRun,
  currentResults: Array<{
    nodeId: string;
    status: NodeExecutionStatus;
    output?: unknown;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
    retryCount: number;
    creditsUsed: number;
  }>,
): ExecutionRun['nodeResults'] {
  const resultMap = new Map<string, ExecutionRun['nodeResults'][0]>();

  for (const result of previousRun.nodeResults) {
    resultMap.set(result.nodeId, result);
  }

  for (const result of currentResults) {
    resultMap.set(result.nodeId, result);
  }

  return Array.from(resultMap.values());
}
