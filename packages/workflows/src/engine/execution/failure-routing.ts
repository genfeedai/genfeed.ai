import { getActionDefinition } from '@genfeedai/actions';
import type {
  ExecutableEdge,
  ExecutableNode,
  NodeExecutionResult,
} from '../types';
import { getExecutableNodeOperationId } from '../utils/action-node';

export type FailureRoutingStates = ReadonlyMap<
  string,
  Pick<NodeExecutionResult, 'status'>
>;

export function isWorkflowEdgeActive(
  edge: ExecutableEdge,
  results: FailureRoutingStates,
): boolean {
  const failed = results.get(edge.source)?.status === 'failed';
  return edge.sourceHandle === 'failure' ? failed : !failed;
}

export function isFailureControlledNode(
  node: ExecutableNode,
  edges: ExecutableEdge[],
): boolean {
  const incoming = edges.filter((edge) => edge.target === node.id);
  if (!incoming.some((edge) => edge.sourceHandle === 'failure')) return false;
  if (incoming.every((edge) => edge.sourceHandle === 'failure')) return true;
  const schema: unknown = getActionDefinition(
    getExecutableNodeOperationId(node),
  )?.inputSchema;
  if (!schema || typeof schema !== 'object' || !('required' in schema))
    return false;
  const required: unknown = schema.required;
  return (
    Array.isArray(required) &&
    required.every((key) => typeof key === 'string') &&
    required.includes('failure')
  );
}

export function isWorkflowNodeReachable(
  nodeId: string,
  edges: ExecutableEdge[],
  completed: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
  results: FailureRoutingStates,
  node?: ExecutableNode,
): boolean {
  const incoming = edges.filter((edge) => edge.target === nodeId);
  if (incoming.length === 0) return true;
  const controlled = node
    ? isFailureControlledNode(node, edges)
    : incoming.every((edge) => edge.sourceHandle === 'failure');
  return incoming.some(
    (edge) =>
      completed.has(edge.source) &&
      !skipped.has(edge.source) &&
      (!controlled || edge.sourceHandle === 'failure') &&
      isWorkflowEdgeActive(edge, results),
  );
}
