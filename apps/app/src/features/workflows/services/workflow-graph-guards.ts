import type { Edge, Node } from '@xyflow/react';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isWorkflowGraphNode(value: unknown): value is Node {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.type === undefined || typeof value.type === 'string') &&
    isRecord(value.data) &&
    isRecord(value.position) &&
    typeof value.position.x === 'number' &&
    Number.isFinite(value.position.x) &&
    typeof value.position.y === 'number' &&
    Number.isFinite(value.position.y)
  );
}

export function isWorkflowGraphEdge(value: unknown): value is Edge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string'
  );
}
