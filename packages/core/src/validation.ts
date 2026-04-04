import type {
  HandleDefinition,
  HandleType,
  NodeType,
  ValidationError,
  ValidationResult,
} from '@genfeedai/types';
import { CONNECTION_RULES, NODE_DEFINITIONS } from '@genfeedai/types';

export type { ValidationError, ValidationResult };

/**
 * Detect cycles in the workflow graph using DFS.
 */
export function detectCycles(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const outgoing = edges.filter((e) => e.source === nodeId);
    for (const edge of outgoing) {
      if (hasCycle(edge.target)) return true;
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (hasCycle(node.id)) return true;
  }

  return false;
}

/**
 * Validate a workflow for execution readiness.
 */
export function validateWorkflow(
  nodes: { id: string; type: string }[],
  edges: { source: string; target: string; targetHandle?: string | null }[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for disconnected required inputs
  for (const node of nodes) {
    const nodeDef = NODE_DEFINITIONS[node.type as NodeType];
    if (!nodeDef) continue;

    const incomingEdges = edges.filter((e) => e.target === node.id);

    for (const input of nodeDef.inputs) {
      if (input.required) {
        const hasConnection = incomingEdges.some(
          (e) => e.targetHandle === input.id,
        );
        if (!hasConnection) {
          errors.push({
            message: `Missing required input: ${input.label}`,
            nodeId: node.id,
            severity: 'error',
          });
        }
      }
    }

    // Check output nodes have at least one media input
    if (node.type === 'download') {
      const hasMediaInput = incomingEdges.some(
        (e) => e.targetHandle === 'image' || e.targetHandle === 'video',
      );
      if (!hasMediaInput) {
        errors.push({
          message:
            'Output node requires at least one Media input (image or video)',
          nodeId: node.id,
          severity: 'error',
        });
      }
    }
  }

  // Check for cycles
  if (detectCycles(nodes, edges)) {
    errors.push({
      message: 'Workflow contains a cycle',
      nodeId: nodes[0]?.id ?? 'unknown',
      severity: 'error',
    });
  }

  return {
    errors,
    isValid: errors.length === 0,
    warnings,
  };
}

/**
 * Get handle type from a node type and handle ID.
 */
export function getHandleType(
  nodeType: NodeType,
  handleId: string | null,
  direction: 'source' | 'target',
): HandleType | null {
  const nodeDef = NODE_DEFINITIONS[nodeType];
  if (!nodeDef) return null;

  const handles = direction === 'source' ? nodeDef.outputs : nodeDef.inputs;
  const handle = handles.find((h: HandleDefinition) => h.id === handleId);

  return handle?.type ?? null;
}

/**
 * Check if a connection between two handles is valid.
 */
export function isValidConnection(
  sourceNodeType: NodeType,
  sourceHandle: string | null,
  targetNodeType: NodeType,
  targetHandle: string | null,
): boolean {
  const sourceType = getHandleType(sourceNodeType, sourceHandle, 'source');
  const targetType = getHandleType(targetNodeType, targetHandle, 'target');

  if (!sourceType || !targetType) return false;

  return CONNECTION_RULES[sourceType]?.includes(targetType) ?? false;
}

/**
 * Get all handle types that can connect to a given handle type.
 */
export function getCompatibleHandles(handleType: HandleType): HandleType[] {
  return CONNECTION_RULES[handleType] ?? [];
}
