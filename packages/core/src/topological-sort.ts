/**
 * Topological sort for workflow execution order.
 * Returns node IDs in dependency-respecting order (sources first, sinks last).
 */
export function topologicalSort(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }

  // Build adjacency list and in-degree count
  for (const edge of edges) {
    adjList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Find all nodes with no incoming edges
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of adjList.get(node) ?? []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

/**
 * Build a dependency map from edges.
 * Returns a map where each node ID maps to its dependencies (nodes it receives input from).
 */
export function buildDependencyMap(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): Map<string, string[]> {
  const deps = new Map<string, string[]>();

  for (const node of nodes) {
    deps.set(node.id, []);
  }

  for (const edge of edges) {
    const existing = deps.get(edge.target) ?? [];
    deps.set(edge.target, [...existing, edge.source]);
  }

  return deps;
}
