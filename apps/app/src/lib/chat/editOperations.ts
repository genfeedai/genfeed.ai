import type { NodeType, WorkflowEdge, WorkflowNode, WorkflowNodeData } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';

/**
 * Edit operation types for workflow modifications.
 * Each operation represents a single atomic change to the workflow.
 */
export type EditOperation =
  | {
      type: 'addNode';
      nodeType: NodeType;
      position?: { x: number; y: number };
      data?: Record<string, unknown>;
    }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'updateNode'; nodeId: string; data: Record<string, unknown> }
  | {
      type: 'addEdge';
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | { type: 'removeEdge'; edgeId: string };

/**
 * Result of applying edit operations to the workflow.
 */
export interface ApplyEditResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  applied: number;
  skipped: string[];
}

/**
 * Applies a batch of edit operations to the current workflow state.
 * Uses immutable updates (single pass, not individual setState calls).
 * Invalid operations are skipped with reasons tracked.
 */
export function applyEditOperations(
  operations: EditOperation[],
  storeState: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
): ApplyEditResult {
  let nodes = [...storeState.nodes];
  let edges = [...storeState.edges];
  const skipped: string[] = [];
  let applied = 0;

  for (const [index, operation] of operations.entries()) {
    switch (operation.type) {
      case 'addNode': {
        const nodeId = `${operation.nodeType}-ai-${Date.now()}-${index}`;
        const position = operation.position ?? { x: 200, y: 200 };
        const definition = NODE_DEFINITIONS[operation.nodeType];
        const defaultData = definition?.defaultData ?? {
          label: operation.nodeType,
          status: 'idle',
        };

        const nodeData = {
          ...defaultData,
          ...operation.data,
        } as WorkflowNodeData;

        const newNode: WorkflowNode = {
          data: nodeData,
          id: nodeId,
          position,
          type: operation.nodeType,
        };

        nodes.push(newNode);
        applied++;
        break;
      }

      case 'removeNode': {
        const nodeExists = nodes.find((n) => n.id === operation.nodeId);
        if (!nodeExists) {
          skipped.push(`removeNode: node "${operation.nodeId}" not found`);
          break;
        }

        nodes = nodes.filter((n) => n.id !== operation.nodeId);
        edges = edges.filter((e) => e.source !== operation.nodeId && e.target !== operation.nodeId);
        applied++;
        break;
      }

      case 'updateNode': {
        const nodeIndex = nodes.findIndex((n) => n.id === operation.nodeId);
        if (nodeIndex === -1) {
          skipped.push(`updateNode: node "${operation.nodeId}" not found`);
          break;
        }

        nodes = nodes.map((n) =>
          n.id === operation.nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...operation.data,
                } as WorkflowNodeData,
              }
            : n
        );
        applied++;
        break;
      }

      case 'addEdge': {
        const sourceExists = nodes.find((n) => n.id === operation.source);
        const targetExists = nodes.find((n) => n.id === operation.target);

        if (!sourceExists) {
          skipped.push(`addEdge: source node "${operation.source}" not found`);
          break;
        }
        if (!targetExists) {
          skipped.push(`addEdge: target node "${operation.target}" not found`);
          break;
        }

        const handleSuffix = operation.sourceHandle ? `-${operation.sourceHandle}` : '';
        const edgeId = `edge-ai-${operation.source}-${operation.target}${handleSuffix}`;

        const newEdge: WorkflowEdge = {
          id: edgeId,
          source: operation.source,
          sourceHandle: operation.sourceHandle,
          target: operation.target,
          targetHandle: operation.targetHandle,
        };

        edges.push(newEdge);
        applied++;
        break;
      }

      case 'removeEdge': {
        const edgeExists = edges.find((e) => e.id === operation.edgeId);
        if (!edgeExists) {
          skipped.push(`removeEdge: edge "${operation.edgeId}" not found`);
          break;
        }

        edges = edges.filter((e) => e.id !== operation.edgeId);
        applied++;
        break;
      }
    }
  }

  return {
    applied,
    edges,
    nodes,
    skipped,
  };
}

/**
 * Generates a human-readable summary of what operations were applied.
 */
export function narrateOperations(operations: EditOperation[]): string {
  const narratives = operations.map((op): string => {
    switch (op.type) {
      case 'addNode': {
        const def = NODE_DEFINITIONS[op.nodeType];
        return `Added a ${def?.label ?? op.nodeType} node`;
      }
      case 'removeNode':
        return `Removed node ${op.nodeId}`;
      case 'updateNode':
        return `Updated ${op.nodeId} settings`;
      case 'addEdge':
        return `Connected ${op.source} to ${op.target}`;
      case 'removeEdge':
        return `Removed connection ${op.edgeId}`;
      default:
        return `Unknown operation`;
    }
  });

  return narratives.join('\n');
}
