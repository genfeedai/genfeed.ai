export function topologicalSort(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  nodeIds?: readonly string[],
): string[] {
  const allowed = new Set(nodeIds ?? nodes.map((node) => node.id));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const id of allowed) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }

  for (const edge of edges) {
    if (!allowed.has(edge.source) || !allowed.has(edge.target)) {
      continue;
    }
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
  let queueHead = 0;
  while (queueHead < queue.length) {
    const current = queue[queueHead];
    queueHead += 1;
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
