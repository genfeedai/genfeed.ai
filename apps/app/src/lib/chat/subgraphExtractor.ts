/**
 * Subgraph Extractor
 *
 * Splits a workflow into a detailed selected subgraph and a summary of the rest,
 * based on React Flow's node.selected property. When users select nodes before
 * chatting, the LLM gets focused context on the selection with a lightweight
 * summary of the surrounding workflow.
 */

import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';

/**
 * Boundary connection between selected and unselected nodes
 */
export interface BoundaryConnection {
  direction: 'incoming' | 'outgoing';
  selectedNodeId: string;
  otherNodeId: string;
  handleType: string;
}

/**
 * Result of subgraph extraction
 */
export interface SubgraphResult {
  selectedNodes: WorkflowNode[];
  selectedEdges: WorkflowEdge[];
  restSummary: {
    nodeCount: number;
    typeBreakdown: Record<string, number>;
    boundaryConnections: BoundaryConnection[];
  } | null;
  isScoped: boolean;
}

/**
 * Extract subgraph based on selected node IDs
 */
export function extractSubgraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  selectedNodeIds: string[]
): SubgraphResult {
  // Early return for no selection - return everything
  if (selectedNodeIds.length === 0) {
    return {
      isScoped: false,
      restSummary: null,
      selectedEdges: edges,
      selectedNodes: nodes,
    };
  }

  const selectedSet = new Set(selectedNodeIds);

  const selectedNodes: WorkflowNode[] = [];
  const unselectedNodes: WorkflowNode[] = [];

  for (const node of nodes) {
    if (selectedSet.has(node.id)) {
      selectedNodes.push(node);
    } else {
      unselectedNodes.push(node);
    }
  }

  const selectedEdges: WorkflowEdge[] = [];
  const boundaryEdges: WorkflowEdge[] = [];

  for (const edge of edges) {
    const sourceSelected = selectedSet.has(edge.source);
    const targetSelected = selectedSet.has(edge.target);

    if (sourceSelected && targetSelected) {
      selectedEdges.push(edge);
    } else if (sourceSelected || targetSelected) {
      boundaryEdges.push(edge);
    }
  }

  const typeBreakdown: Record<string, number> = {};
  for (const node of unselectedNodes) {
    const type = node.type ?? 'unknown';
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  }

  const boundaryConnections: BoundaryConnection[] = boundaryEdges.map((edge) => {
    const targetSelected = selectedSet.has(edge.target);

    if (targetSelected) {
      return {
        direction: 'incoming' as const,
        handleType: edge.targetHandle || 'unknown',
        otherNodeId: edge.source,
        selectedNodeId: edge.target,
      };
    } else {
      return {
        direction: 'outgoing' as const,
        handleType: edge.sourceHandle || 'unknown',
        otherNodeId: edge.target,
        selectedNodeId: edge.source,
      };
    }
  });

  return {
    isScoped: true,
    restSummary: {
      boundaryConnections,
      nodeCount: unselectedNodes.length,
      typeBreakdown,
    },
    selectedEdges,
    selectedNodes,
  };
}
