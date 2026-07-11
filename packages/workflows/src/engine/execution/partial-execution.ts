import type { ExecutableEdge, ExecutableNode } from '@workflow-engine/types';

export interface PartialExecutionPlan {
  nodesToExecute: string[];
  nodesRequiringCache: string[];
  missingDependencies: Array<{
    nodeId: string;
    missingInputs: string[];
  }>;
  executionOrder: string[];
  isValid: boolean;
  errors: string[];
}

function buildDependencyGraph(
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();

  for (const node of nodes) {
    dependencies.set(node.id, []);
  }

  for (const edge of edges) {
    const deps = dependencies.get(edge.target) ?? [];
    deps.push(edge.source);
    dependencies.set(edge.target, deps);
  }

  return dependencies;
}

function topologicalSort(
  nodeIds: string[],
  dependencies: Map<string, string[]>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, 0);
    adjList.set(nodeId, []);
  }

  for (const nodeId of nodeIds) {
    const deps = dependencies.get(nodeId) ?? [];
    for (const dep of deps) {
      if (nodeIds.includes(dep)) {
        inDegree.set(nodeId, (inDegree.get(nodeId) ?? 0) + 1);
        const adj = adjList.get(dep) ?? [];
        adj.push(nodeId);
        adjList.set(dep, adj);
      }
    }
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

function findAllDependencies(
  nodeIds: string[],
  dependencies: Map<string, string[]>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...nodeIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const deps = dependencies.get(current) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return visited;
}

export function planPartialExecution(
  selectedNodeIds: string[],
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
  nodeCache: Map<string, unknown>,
): PartialExecutionPlan {
  const errors: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Validate selected nodes exist
  for (const nodeId of selectedNodeIds) {
    if (!nodeMap.has(nodeId)) {
      errors.push(`Node ${nodeId} not found in workflow`);
    }
  }

  if (errors.length > 0) {
    return {
      errors,
      executionOrder: [],
      isValid: false,
      missingDependencies: [],
      nodesRequiringCache: [],
      nodesToExecute: [],
    };
  }

  const dependencies = buildDependencyGraph(nodes, edges);
  const allNeededNodes = findAllDependencies(selectedNodeIds, dependencies);

  const nodesToExecute = new Set(selectedNodeIds);
  const nodesRequiringCache: string[] = [];
  const missingDependencies: Array<{
    nodeId: string;
    missingInputs: string[];
  }> = [];

  for (const nodeId of allNeededNodes) {
    if (!nodesToExecute.has(nodeId)) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      if (node.isLocked && node.cachedOutput !== undefined) {
        nodesRequiringCache.push(nodeId);
      } else if (nodeCache.has(nodeId)) {
        nodesRequiringCache.push(nodeId);
      } else {
        for (const selectedNodeId of selectedNodeIds) {
          const selectedDeps = dependencies.get(selectedNodeId) ?? [];
          if (
            selectedDeps.includes(nodeId) ||
            findAllDependencies([selectedNodeId], dependencies).has(nodeId)
          ) {
            const existing = missingDependencies.find(
              (m) => m.nodeId === selectedNodeId,
            );
            if (existing) {
              existing.missingInputs.push(nodeId);
            } else {
              missingDependencies.push({
                missingInputs: [nodeId],
                nodeId: selectedNodeId,
              });
            }
          }
        }
      }
    }
  }

  if (missingDependencies.length > 0) {
    for (const missing of missingDependencies) {
      errors.push(
        `Node ${missing.nodeId} requires output from ${missing.missingInputs.join(', ')} which is not available in cache`,
      );
    }
  }

  const executionOrder = topologicalSort(selectedNodeIds, dependencies);

  return {
    errors,
    executionOrder,
    isValid: errors.length === 0,
    missingDependencies,
    nodesRequiringCache,
    nodesToExecute: selectedNodeIds,
  };
}

export function canExecuteNode(
  nodeId: string,
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
  completedNodes: Set<string>,
  nodeCache: Map<string, unknown>,
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return false;
  }

  const nodeDependencies = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);

  for (const dep of nodeDependencies) {
    const depNode = nodes.find((n) => n.id === dep);
    if (!depNode) {
      return false;
    }

    const isCompleted = completedNodes.has(dep);
    const isCached = nodeCache.has(dep);
    const isLockedWithOutput =
      depNode.isLocked && depNode.cachedOutput !== undefined;

    if (!isCompleted && !isCached && !isLockedWithOutput) {
      return false;
    }
  }

  return true;
}
