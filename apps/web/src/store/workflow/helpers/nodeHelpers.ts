import type { HandleType, NodeType } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { nanoid } from 'nanoid';

/**
 * Generate a unique ID for nodes and edges
 */
export function generateId(): string {
  return nanoid(8);
}

/**
 * Get handle type from node type and handle id
 */
export function getHandleType(
  nodeType: NodeType,
  handleId: string | null,
  direction: 'source' | 'target'
): HandleType | null {
  const nodeDef = NODE_DEFINITIONS[nodeType];
  if (!nodeDef) return null;

  const handles = direction === 'source' ? nodeDef.outputs : nodeDef.inputs;
  const handle = handles.find((h) => h.id === handleId);

  return handle?.type ?? null;
}
