import type { WorkflowEdge, WorkflowNode, WorkflowNodeData } from '@genfeedai/types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import {
  selectDuplicateNode,
  selectEdges,
  selectNodes,
  selectRemoveNode,
} from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';

interface ClipboardData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isCut: boolean;
}

/**
 * Create remapped nodes and edges from clipboard data at the given position offset.
 * Shared by both `pasteNodes` and `getPasteData`.
 */
function createPastePayload(
  clipboard: ClipboardData,
  offsetX: number,
  offsetY: number
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const { nodes: clipboardNodes, edges: clipboardEdges } = clipboard;

  // Create a map from old IDs to new IDs
  const idMap = new Map<string, string>();
  for (const node of clipboardNodes) {
    idMap.set(node.id, nanoid(8));
  }

  // Calculate the top-left corner of the copied nodes for offset calculation
  const minX = Math.min(...clipboardNodes.map((n) => n.position.x));
  const minY = Math.min(...clipboardNodes.map((n) => n.position.y));

  // Create new nodes with remapped IDs and offset positions
  const newNodes: WorkflowNode[] = clipboardNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      error: undefined,
      jobId: null,
      status: 'idle',
    } as WorkflowNodeData,
    id: idMap.get(node.id)!,
    position: {
      x: node.position.x - minX + offsetX,
      y: node.position.y - minY + offsetY,
    },
    selected: true,
  }));

  // Remap edges to use new node IDs
  const newEdges: WorkflowEdge[] = clipboardEdges.map((edge) => ({
    ...edge,
    id: nanoid(8),
    source: idMap.get(edge.source)!,
    target: idMap.get(edge.target)!,
  }));

  return { edges: newEdges, nodes: newNodes };
}

export function useNodeActions() {
  const nodes = useWorkflowStore(selectNodes);
  const edges = useWorkflowStore(selectEdges);
  const removeNode = useWorkflowStore(selectRemoveNode);
  const duplicateNode = useWorkflowStore(selectDuplicateNode);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  const deleteNode = useCallback(
    (nodeId: string) => {
      removeNode(nodeId);
    },
    [removeNode]
  );

  const duplicate = useCallback(
    (nodeId: string) => {
      return duplicateNode(nodeId);
    },
    [duplicateNode]
  );

  const copyNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        // Copy the node and any edges between copied nodes (just one node here)
        setClipboard({ edges: [], isCut: false, nodes: [node] });
      }
    },
    [nodes]
  );

  const copyMultipleNodes = useCallback(
    (nodeIds: string[]) => {
      const nodeSet = new Set(nodeIds);
      const nodesToCopy = nodes.filter((n) => nodeSet.has(n.id));
      // Copy edges that connect nodes within the selection
      const edgesToCopy = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
      if (nodesToCopy.length > 0) {
        setClipboard({ edges: edgesToCopy, isCut: false, nodes: nodesToCopy });
      }
    },
    [nodes, edges]
  );

  const cutNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setClipboard({ edges: [], isCut: true, nodes: [node] });
        removeNode(nodeId);
      }
    },
    [nodes, removeNode]
  );

  const cutMultipleNodes = useCallback(
    (nodeIds: string[]) => {
      const nodeSet = new Set(nodeIds);
      const nodesToCut = nodes.filter((n) => nodeSet.has(n.id));
      const edgesToCut = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
      if (nodesToCut.length > 0) {
        setClipboard({ edges: edgesToCut, isCut: true, nodes: nodesToCut });
        for (const nodeId of nodeIds) {
          removeNode(nodeId);
        }
      }
    },
    [nodes, edges, removeNode]
  );

  const deleteMultipleNodes = useCallback(
    (nodeIds: string[]) => {
      for (const nodeId of nodeIds) {
        removeNode(nodeId);
      }
    },
    [removeNode]
  );

  const duplicateMultipleNodes = useCallback(
    (nodeIds: string[]) => {
      const newIds: string[] = [];
      for (const nodeId of nodeIds) {
        const newId = duplicateNode(nodeId);
        if (newId) {
          newIds.push(newId);
        }
      }
      return newIds;
    },
    [duplicateNode]
  );

  /**
   * Paste nodes from clipboard at the given position offset.
   * Returns the new node IDs if paste was successful.
   */
  const pasteNodes = useCallback(
    (offsetX: number, offsetY: number): { nodeIds: string[]; edgeIds: string[] } | null => {
      if (!clipboard || clipboard.nodes.length === 0) return null;

      const payload = createPastePayload(clipboard, offsetX, offsetY);

      // Clear cut clipboard after paste (cut is one-time)
      if (clipboard.isCut) {
        setClipboard(null);
      }

      return {
        edgeIds: payload.edges.map((e) => e.id),
        nodeIds: payload.nodes.map((n) => n.id),
      };
    },
    [clipboard]
  );

  /**
   * Get nodes and edges to paste with remapped IDs.
   * Used by the context menu to actually add them to the store.
   */
  const getPasteData = useCallback(
    (offsetX: number, offsetY: number): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null => {
      if (!clipboard || clipboard.nodes.length === 0) return null;

      const payload = createPastePayload(clipboard, offsetX, offsetY);

      // Clear cut clipboard after paste (cut is one-time)
      if (clipboard.isCut) {
        setClipboard(null);
      }

      return payload;
    },
    [clipboard]
  );

  return {
    clipboard,
    copyMultipleNodes,
    copyNode,
    cutMultipleNodes,
    cutNode,
    deleteMultipleNodes,
    deleteNode,
    duplicate,
    duplicateMultipleNodes,
    getPasteData,
    pasteNodes,
  };
}
