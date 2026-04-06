import {
  isNodeDataRecord,
  type NodeDataRecord,
} from '@/features/workflows/nodes/node-data';

export interface WorkflowGraphEdgeLike {
  source: string;
  target: string;
}

export interface WorkflowGraphNodeLike {
  data?: unknown;
  id: string;
  position?: {
    x?: number;
    y?: number;
  };
  type?: string;
}

export function coerceWorkflowItems<T>(items: unknown): T[] {
  return Array.isArray(items) ? (items as T[]) : [];
}

export function getWorkflowNodeConfig(
  node: WorkflowGraphNodeLike,
): NodeDataRecord {
  return isNodeDataRecord(node.data) ? node.data : {};
}

export function getWorkflowNodeLabel(node: WorkflowGraphNodeLike): string {
  const config = getWorkflowNodeConfig(node);

  return typeof config.label === 'string'
    ? config.label
    : (node.type ?? node.id);
}
