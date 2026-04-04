import type { WorkflowNodeData } from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import type { ContextMenuItemConfig } from '@/components/context-menu';
import {
  getEdgeMenuItems,
  getNodeMenuItems,
  getPaneMenuItems,
  getSelectionMenuItems,
} from '@/components/context-menu/menus';
import { workflowsApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useContextMenuStore } from '@/store/contextMenuStore';
import {
  selectCreateGroup,
  selectNodes,
  selectSetSelectedNodeIds,
  selectToggleNodeLock,
  selectUpdateNodeData,
  selectWorkflowId,
} from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';
import { useNodeActions } from './useNodeActions';
import { usePaneActions } from './usePaneActions';

export function useContextMenu() {
  const {
    isOpen,
    position,
    menuType,
    targetId,
    targetIds,
    openNodeMenu,
    openEdgeMenu,
    openPaneMenu,
    openSelectionMenu,
    close,
  } = useContextMenuStore();

  const nodes = useWorkflowStore(selectNodes);
  const removeEdge = useWorkflowStore((state) => state.removeEdge);
  const toggleNodeLock = useWorkflowStore(selectToggleNodeLock);
  const createGroup = useWorkflowStore(selectCreateGroup);
  const workflowId = useWorkflowStore(selectWorkflowId);
  const addNodesAndEdges = useWorkflowStore((state) => state.addNodesAndEdges);
  const setSelectedNodeIds = useWorkflowStore(selectSetSelectedNodeIds);
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const {
    clipboard,
    deleteNode,
    duplicate,
    copyNode,
    cutNode,
    deleteMultipleNodes,
    duplicateMultipleNodes,
    getPasteData,
  } = useNodeActions();
  const { addNodeAtPosition, selectAll, fitView, autoLayout } = usePaneActions();
  const reactFlow = useReactFlow();

  // Stable reference for handlers that don't need to change
  const stableHandlersRef = useRef({
    addNodeAtPosition,
    autoLayout,
    copyNode,
    cutNode,
    deleteMultipleNodes,
    deleteNode,
    duplicate,
    duplicateMultipleNodes,
    fitView,
    removeEdge,
    selectAll,
  });

  // Update ref on each render (avoids stale closures while maintaining stable reference)
  stableHandlersRef.current = {
    addNodeAtPosition,
    autoLayout,
    copyNode,
    cutNode,
    deleteMultipleNodes,
    deleteNode,
    duplicate,
    duplicateMultipleNodes,
    fitView,
    removeEdge,
    selectAll,
  };

  const lockNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && !node.data.locked) {
        toggleNodeLock(nodeId);
      }
    },
    [nodes, toggleNodeLock]
  );

  const unlockNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node?.data.locked) {
        toggleNodeLock(nodeId);
      }
    },
    [nodes, toggleNodeLock]
  );

  const groupNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length > 1) {
        createGroup(nodeIds);
      }
    },
    [createGroup]
  );

  const lockAllNodes = useCallback(
    (nodeIds: string[]) => {
      for (const nodeId of nodeIds) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node && !node.data.locked) {
          toggleNodeLock(nodeId);
        }
      }
    },
    [nodes, toggleNodeLock]
  );

  const unlockAllNodes = useCallback(
    (nodeIds: string[]) => {
      for (const nodeId of nodeIds) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node?.data.locked) {
          toggleNodeLock(nodeId);
        }
      }
    },
    [nodes, toggleNodeLock]
  );

  const alignNodesHorizontally = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length < 2) return;

      const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
      if (selectedNodes.length < 2) return;

      // Calculate average Y position
      const avgY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length;

      // Update all selected nodes to the same Y position
      reactFlow.setNodes((nds) =>
        nds.map((node) =>
          nodeIds.includes(node.id) ? { ...node, position: { ...node.position, y: avgY } } : node
        )
      );
    },
    [nodes, reactFlow]
  );

  const alignNodesVertically = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length < 2) return;

      const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
      if (selectedNodes.length < 2) return;

      // Calculate average X position
      const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length;

      // Update all selected nodes to the same X position
      reactFlow.setNodes((nds) =>
        nds.map((node) =>
          nodeIds.includes(node.id) ? { ...node, position: { ...node.position, x: avgX } } : node
        )
      );
    },
    [nodes, reactFlow]
  );

  const pasteNodes = useCallback(() => {
    if (!clipboard) return;

    // Convert the context menu position to flow coordinates
    const flowPosition = reactFlow.screenToFlowPosition({
      x: position.x,
      y: position.y,
    });

    const pasteData = getPasteData(flowPosition.x, flowPosition.y);
    if (!pasteData) return;

    // Add nodes and edges to the store
    addNodesAndEdges(pasteData.nodes, pasteData.edges);

    // Select the pasted nodes
    setSelectedNodeIds(pasteData.nodes.map((n) => n.id));
  }, [clipboard, position, reactFlow, getPasteData, addNodesAndEdges, setSelectedNodeIds]);

  const setNodeColor = useCallback(
    (nodeId: string, color: string | null) => {
      updateNodeData(nodeId, { color: color || undefined });
    },
    [updateNodeData]
  );

  const setAsThumbnail = useCallback(
    async (nodeId: string) => {
      if (!workflowId) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const data = node.data as WorkflowNodeData & {
        outputVideo?: string;
        outputImage?: string;
      };

      const thumbnailUrl = data.outputVideo || data.outputImage;
      if (!thumbnailUrl) return;

      try {
        await workflowsApi.setThumbnail(workflowId, thumbnailUrl, nodeId);
        logger.info('Thumbnail set successfully', { nodeId, workflowId });
      } catch (error) {
        logger.error('Failed to set thumbnail', error, { nodeId, workflowId });
      }
    },
    [workflowId, nodes]
  );

  const hasMediaOutput = useCallback(
    (nodeId: string): boolean => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return false;

      const data = node.data as WorkflowNodeData & {
        outputVideo?: string;
        outputImage?: string;
      };

      return Boolean(data.outputVideo || data.outputImage);
    },
    [nodes]
  );

  const getMenuItems = useCallback((): ContextMenuItemConfig[] => {
    if (!menuType) return [];

    const handlers = stableHandlersRef.current;

    switch (menuType) {
      case 'node': {
        if (!targetId) return [];
        const node = nodes.find((n) => n.id === targetId);
        const isLocked = Boolean(node?.data.locked);
        const nodeHasMediaOutput = hasMediaOutput(targetId);
        const currentColor = (node?.data as { color?: string })?.color;
        return getNodeMenuItems({
          currentColor,
          hasMediaOutput: nodeHasMediaOutput,
          isLocked,
          nodeId: targetId,
          onCopy: handlers.copyNode,
          onCut: handlers.cutNode,
          onDelete: handlers.deleteNode,
          onDuplicate: handlers.duplicate,
          onLock: lockNode,
          onSetAsThumbnail: workflowId ? setAsThumbnail : undefined,
          onSetColor: setNodeColor,
          onUnlock: unlockNode,
        });
      }

      case 'edge':
        if (!targetId) return [];
        return getEdgeMenuItems({
          edgeId: targetId,
          onDelete: handlers.removeEdge,
        });

      case 'pane':
        return getPaneMenuItems({
          hasClipboard: !!clipboard,
          onAddNode: handlers.addNodeAtPosition,
          onAutoLayout: () => handlers.autoLayout('LR'),
          onFitView: handlers.fitView,
          onPaste: pasteNodes,
          onSelectAll: handlers.selectAll,
          screenX: position.x,
          screenY: position.y,
        });

      case 'selection':
        if (!targetIds || targetIds.length === 0) return [];
        return getSelectionMenuItems({
          nodeIds: targetIds,
          onAlignHorizontal: alignNodesHorizontally,
          onAlignVertical: alignNodesVertically,
          onDeleteAll: handlers.deleteMultipleNodes,
          onDuplicateAll: handlers.duplicateMultipleNodes,
          onGroup: groupNodes,
          onLockAll: lockAllNodes,
          onUnlockAll: unlockAllNodes,
        });

      default:
        return [];
    }
  }, [
    menuType,
    targetId,
    targetIds,
    nodes,
    position,
    clipboard,
    lockNode,
    unlockNode,
    pasteNodes,
    groupNodes,
    lockAllNodes,
    unlockAllNodes,
    alignNodesHorizontally,
    alignNodesVertically,
    hasMediaOutput,
    setAsThumbnail,
    setNodeColor,
    workflowId,
  ]);

  const menuItems = useMemo(() => getMenuItems(), [getMenuItems]);

  return {
    close,
    isOpen,
    menuItems,
    menuType,
    openEdgeMenu,
    openNodeMenu,
    openPaneMenu,
    openSelectionMenu,
    position,
  };
}
