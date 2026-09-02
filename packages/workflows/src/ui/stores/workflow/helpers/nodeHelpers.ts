import type { HandleType, NodeType } from '@genfeedai/contracts/types';
import { nanoid } from 'nanoid';
import { getNodeDefinition } from '../../../../nodes/registry/merged-registry';

/**
 * Generate a unique ID for nodes and edges
 */
export function generateId(): string {
  return nanoid(8);
}

/**
 * Get handle type from node type and handle id (core or SaaS).
 */
export function getHandleType(
  nodeType: NodeType | string,
  handleId: string | null,
  direction: 'source' | 'target',
): HandleType | null {
  const nodeDef = getNodeDefinition(String(nodeType));
  if (!nodeDef) return null;

  const handles = direction === 'source' ? nodeDef.outputs : nodeDef.inputs;
  const handle = handles.find((h) => h.id === handleId);

  return (handle?.type as HandleType | undefined) ?? null;
}
