import type { WorkflowNodeData } from '@genfeedai/contracts/types';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import type { ContextMenuItemConfig } from '../components/context-menu';
import {
  getEdgeMenuItems,
  getNodeMenuItems,
  getPaneMenuItems,
  getSelectionMenuItems,
} from '../components/context-menu/menus';
import { createIdLookup, filterItemsByIdLookup } from '../lib';
import { useWorkflowUIConfig } from '../provider/WorkflowUIProvider';
import { useContextMenuStore } from '../stores/contextMenuStore';
import { useWorkflowStore } from '../stores/workflow';
import {
  selectCreateGroup,
  selectNodes,
  selectSetSelectedNodeIds,
  selectToggleNodeLock,
  selectUpdateNodeData,
  selectWorkflowId,
} from '../stores/workflow/selectors';
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

  const { workflowsApi } = useWorkflowUIConfig();

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
    copyNodes,
    cutNodes,
    deleteNodes,
    duplicateNodes,
    getPasteData,
  } = useNodeActions();
  const { addNodeAtPosition, selectAll, fitView, autoLayout } =
    usePaneActions();
  const reactFlow = useReactFlow();
  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  // Stable reference for handlers that don't need to change
  const stableHandlersRef = useRef({
    addNodeAtPosition,
    autoLayout,
    copyNodes,
    cutNodes,
    deleteNodes,
    duplicateNodes,
    fitView,
    removeEdge,
    selectAll,
  });

  // Update ref on each render (avoids stale closures while maintaining stable reference)
  stableHandlersRef.current = {
    addNodeAtPosition,
    autoLayout,
    copyNodes,
    cutNodes,
    deleteNodes,
    duplicateNodes,
    fitView,
    removeEdge,
    selectAll,
  };

  /** Lock the given nodes, skipping any that are already locked. */
  const lockNodes = useCallback(
    (nodeIds: string[]) => {
      for (const nodeId of nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node && !node.data.locked) {
          toggleNodeLock(nodeId);
        }
      }
    },
    [nodeMap, toggleNodeLock],
  );

  /** Unlock the given nodes, skipping any that are already unlocked. */
  const unlockNodes = useCallback(
    (nodeIds: string[]) => {
      for (const nodeId of nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node?.data.locked) {
          toggleNodeLock(nodeId);
        }
      }
    },
    [nodeMap, toggleNodeLock],
  );

  const groupNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length > 1) {
        createGroup(nodeIds);
      }
    },
    [createGroup],
  );

  const alignNodesHorizontally = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length < 2) return;

      const nodeIdLookup = createIdLookup(nodeIds);
      const selectedNodes = filterItemsByIdLookup(nodes, nodeIdLookup);
      if (selectedNodes.length < 2) return;

      // Calculate average Y position
      const avgY =
        selectedNodes.reduce((sum, n) => sum + n.position.y, 0) /
        selectedNodes.length;

      // Update all selected nodes to the same Y position
      reactFlow.setNodes((nds) =>
        nds.map((node) =>
          nodeIdLookup.has(node.id)
            ? { ...node, position: { ...node.position, y: avgY } }
            : node,
        ),
      );
    },
    [nodes, reactFlow],
  );

  const alignNodesVertically = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length < 2) return;

      const nodeIdLookup = createIdLookup(nodeIds);
      const selectedNodes = filterItemsByIdLookup(nodes, nodeIdLookup);
      if (selectedNodes.length < 2) return;

      // Calculate average X position
      const avgX =
        selectedNodes.reduce((sum, n) => sum + n.position.x, 0) /
        selectedNodes.length;

      // Update all selected nodes to the same X position
      reactFlow.setNodes((nds) =>
        nds.map((node) =>
          nodeIdLookup.has(node.id)
            ? { ...node, position: { ...node.position, x: avgX } }
            : node,
        ),
      );
    },
    [nodes, reactFlow],
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
  }, [
    clipboard,
    position,
    reactFlow,
    getPasteData,
    addNodesAndEdges,
    setSelectedNodeIds,
  ]);

  const setNodeColor = useCallback(
    (nodeId: string, color: string | null) => {
      updateNodeData(nodeId, { color: color || undefined });
    },
    [updateNodeData],
  );

  const setAsThumbnail = useCallback(
    async (nodeId: string) => {
      if (!workflowId || !workflowsApi) return;

      const node = nodeMap.get(nodeId);
      if (!node) return;

      const data = node.data as WorkflowNodeData & {
        outputVideo?: string;
        outputImage?: string;
      };

      const thumbnailUrl = data.outputVideo || data.outputImage;
      if (!thumbnailUrl) return;

      try {
        await workflowsApi.setThumbnail(workflowId, thumbnailUrl, nodeId);
      } catch {
        // Silently fail — consuming app can handle errors via its own API layer
      }
    },
    [nodeMap, workflowId, workflowsApi],
  );

  const hasMediaOutput = useCallback(
    (nodeId: string): boolean => {
      const node = nodeMap.get(nodeId);
      if (!node) return false;

      const data = node.data as WorkflowNodeData & {
        outputVideo?: string;
        outputImage?: string;
      };

      return Boolean(data.outputVideo || data.outputImage);
    },
    [nodeMap],
  );

  const getMenuItems = useCallback((): ContextMenuItemConfig[] => {
    if (!menuType) return [];

    const handlers = stableHandlersRef.current;

    switch (menuType) {
      case 'node': {
        if (!targetId) return [];
        const node = nodeMap.get(targetId);
        const isLocked = Boolean(node?.data.locked);
        const nodeHasMediaOutput = hasMediaOutput(targetId);
        const currentColor = (node?.data as { color?: string })?.color;
        return getNodeMenuItems({
          currentColor,
          hasMediaOutput: nodeHasMediaOutput,
          isLocked,
          nodeId: targetId,
          onCopy: (nodeId) => handlers.copyNodes([nodeId]),
          onCut: (nodeId) => handlers.cutNodes([nodeId]),
          onDelete: (nodeId) => handlers.deleteNodes([nodeId]),
          onDuplicate: (nodeId) => handlers.duplicateNodes([nodeId]),
          onLock: (nodeId) => lockNodes([nodeId]),
          onSetAsThumbnail:
            workflowId && workflowsApi ? setAsThumbnail : undefined,
          onSetColor: setNodeColor,
          onUnlock: (nodeId) => unlockNodes([nodeId]),
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
          onDeleteAll: handlers.deleteNodes,
          onDuplicateAll: handlers.duplicateNodes,
          onGroup: groupNodes,
          onLockAll: lockNodes,
          onUnlockAll: unlockNodes,
        });

      default:
        return [];
    }
  }, [
    menuType,
    targetId,
    targetIds,
    nodeMap,
    position,
    clipboard,
    lockNodes,
    unlockNodes,
    pasteNodes,
    groupNodes,
    alignNodesHorizontally,
    alignNodesVertically,
    hasMediaOutput,
    setAsThumbnail,
    setNodeColor,
    workflowId,
    workflowsApi,
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
