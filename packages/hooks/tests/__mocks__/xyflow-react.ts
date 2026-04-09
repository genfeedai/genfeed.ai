import * as React from 'react';

export function addEdge<T>(edge: T, edges: T[]): T[] {
  return [...edges, edge];
}

export function useEdgesState<T>(initial: T[]) {
  const [edges, setEdges] = React.useState(initial);
  return [edges, setEdges, () => undefined] as const;
}

export function useNodesState<T>(initial: T[]) {
  const [nodes, setNodes] = React.useState(initial);
  return [nodes, setNodes, () => undefined] as const;
}
