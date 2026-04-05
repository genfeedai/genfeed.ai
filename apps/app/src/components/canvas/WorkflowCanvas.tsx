'use client';

import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  Controls,
  MiniMap,
  type Node,
  ReactFlow,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import { PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';

import type {
  HandleType,
  ImageGenNodeData,
  NodeType,
  VideoGenNodeData,
  WorkflowEdge,
  WorkflowNode,
} from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { GroupOverlay } from '@/components/canvas/GroupOverlay';
import { HelperLines } from '@/components/canvas/HelperLines';
import { NodeSearch } from '@/components/canvas/NodeSearch';
import { ShortcutHelpModal } from '@/components/canvas/ShortcutHelpModal';
import { ContextMenu } from '@/components/context-menu';
import { nodeTypes, NodeDetailModal } from '@genfeedai/workflow-ui/nodes';
import { useCanvasKeyboardShortcuts } from '@genfeedai/workflow-ui/hooks';
import { useContextMenu } from '@/hooks/useContextMenu';
import { DEFAULT_NODE_COLOR } from '@/lib/constants/colors';
import { supportsImageInput } from '@/lib/utils/schemaUtils';
import { useExecutionStore } from '@/store/executionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';

function getEdgeDataType(
  edge: WorkflowEdge,
  nodeMap: Map<string, WorkflowNode>
): HandleType | null {
  const sourceNode = nodeMap.get(edge.source);
  if (!sourceNode) return null;

  const nodeDef = NODE_DEFINITIONS[sourceNode.type as NodeType];
  if (!nodeDef) return null;

  const sourceHandle = nodeDef.outputs.find((h) => h.id === edge.sourceHandle);
  return sourceHandle?.type ?? null;
}

export function WorkflowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    findCompatibleHandle,
    addNode,
    selectedNodeIds,
    setSelectedNodeIds,
    toggleNodeLock,
    createGroup,
    deleteGroup,
    unlockAllNodes,
    groups,
    getConnectedNodeIds,
  } = useWorkflowStore();

  const {
    selectNode,
    setHighlightedNodeIds,
    highlightedNodeIds,
    showPalette,
    togglePalette,
    openModal,
  } = useUIStore();
  const reactFlow = useReactFlow();
  const { edgeStyle, showMinimap } = useSettingsStore();
  const isRunning = useExecutionStore((state) => state.isRunning);
  const currentNodeId = useExecutionStore((state) => state.currentNodeId);
  const executingNodeIds = useExecutionStore((state) => state.executingNodeIds);
  const activeNodeExecutions = useExecutionStore((state) => state.activeNodeExecutions);
  const hasActiveNodeExecutions = useExecutionStore((state) => state.activeNodeExecutions.size > 0);

  const [isMinimapVisible, setIsMinimapVisible] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MINIMAP_HIDE_DELAY = 1500; // ms after stopping movement

  const {
    isOpen: isContextMenuOpen,
    position: contextMenuPosition,
    menuItems: contextMenuItems,
    openNodeMenu,
    openEdgeMenu,
    openPaneMenu,
    openSelectionMenu,
    close: closeContextMenu,
  } = useContextMenu();

  const openShortcutHelp = useCallback(() => openModal('shortcutHelp'), [openModal]);
  const openNodeSearch = useCallback(() => openModal('nodeSearch'), [openModal]);

  const { removeNode, removeEdge } = useWorkflowStore();

  const deleteSelectedElements = useCallback(() => {
    const nodesToDelete = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const edgesToDelete = edges.filter((e) => e.selected);
    for (const node of nodesToDelete) {
      removeNode(node.id);
    }
    for (const edge of edgesToDelete) {
      removeEdge(edge.id);
    }
  }, [nodes, edges, selectedNodeIds, removeNode, removeEdge]);

  useCanvasKeyboardShortcuts({
    addNode,
    createGroup,
    deleteGroup,
    deleteSelectedElements,
    fitView: reactFlow.fitView,
    groups,
    nodes,
    openNodeSearch,
    openShortcutHelp,
    selectedNodeIds,
    toggleNodeLock,
    togglePalette,
    unlockAllNodes,
  });

  useEffect(() => {
    if (selectedNodeIds.length === 0) {
      setHighlightedNodeIds([]);
    } else {
      const connectedIds = getConnectedNodeIds(selectedNodeIds);
      setHighlightedNodeIds(connectedIds);
    }
  }, [selectedNodeIds, getConnectedNodeIds, setHighlightedNodeIds]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const isEdgeTargetingDisabledInput = useCallback(
    (edge: WorkflowEdge): boolean => {
      const targetNode = nodeMap.get(edge.target);
      if (!targetNode) return false;

      if (targetNode.type === 'imageGen' && edge.targetHandle === 'images') {
        const nodeData = targetNode.data as ImageGenNodeData;
        const hasImageSupport = supportsImageInput(nodeData?.selectedModel?.inputSchema);
        return !hasImageSupport;
      }

      if (targetNode.type === 'videoGen') {
        if (edge.targetHandle === 'image' || edge.targetHandle === 'lastFrame') {
          const nodeData = targetNode.data as VideoGenNodeData;
          const hasImageSupport = supportsImageInput(nodeData?.selectedModel?.inputSchema);
          return !hasImageSupport;
        }
      }

      return false;
    },
    [nodeMap]
  );

  const styledEdges = useMemo(() => {
    const executionScope = executingNodeIds.length > 0 ? new Set(executingNodeIds) : null;
    const highlightedSet = highlightedNodeIds.length > 0 ? new Set(highlightedNodeIds) : null;

    return edges.map((edge) => {
      const dataType = getEdgeDataType(edge, nodeMap);
      const typeClass = dataType ? `edge-${dataType}` : '';
      const isDisabledTarget = isEdgeTargetingDisabledInput(edge);

      if (!isRunning && hasActiveNodeExecutions) {
        const isActiveEdge =
          activeNodeExecutions.has(edge.source) || activeNodeExecutions.has(edge.target);

        if (isActiveEdge && !isDisabledTarget) {
          return {
            ...edge,
            animated: false,
            className: `${typeClass} executing`.trim(),
          };
        }
      }

      if (isRunning) {
        const isInExecutionScope =
          !executionScope || executionScope.has(edge.source) || executionScope.has(edge.target);
        const isExecutingEdge =
          currentNodeId && (edge.source === currentNodeId || edge.target === currentNodeId);

        if (isDisabledTarget) {
          return {
            ...edge,
            animated: false,
            className: `${typeClass} edge-disabled`.trim(),
          };
        }

        if (!isInExecutionScope) {
          return {
            ...edge,
            animated: false,
            className: typeClass,
          };
        }

        return {
          ...edge,
          animated: false,
          className: `${typeClass} ${isExecutingEdge ? 'executing' : 'active-pipe'}`.trim(),
        };
      }

      if (isDisabledTarget) {
        return {
          ...edge,
          className: `${typeClass} edge-disabled`.trim(),
        };
      }

      if (highlightedSet) {
        const isConnected = highlightedSet.has(edge.source) && highlightedSet.has(edge.target);
        return {
          ...edge,
          className: `${typeClass} ${isConnected ? 'highlighted' : 'dimmed'}`.trim(),
        };
      }

      return {
        ...edge,
        className: typeClass,
      };
    });
  }, [
    edges,
    nodeMap,
    highlightedNodeIds,
    isRunning,
    currentNodeId,
    executingNodeIds,
    activeNodeExecutions,
    hasActiveNodeExecutions,
    isEdgeTargetingDisabledInput,
  ]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: WorkflowNode) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setSelectedNodeIds([]);
  }, [selectNode, setSelectedNodeIds]);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)) {
        openSelectionMenu(selectedNodeIds, event.clientX, event.clientY);
      } else {
        openNodeMenu(node.id, event.clientX, event.clientY);
      }
    },
    [selectedNodeIds, openNodeMenu, openSelectionMenu]
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: WorkflowEdge) => {
      event.preventDefault();
      openEdgeMenu(edge.id, event.clientX, event.clientY);
    },
    [openEdgeMenu]
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      openPaneMenu(event.clientX, event.clientY);
    },
    [openPaneMenu]
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent, selectedNodes: Node[]) => {
      event.preventDefault();
      const nodeIds = selectedNodes.map((n) => n.id);
      openSelectionMenu(nodeIds, event.clientX, event.clientY);
    },
    [openSelectionMenu]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('nodeType') as NodeType;
      if (!nodeType) return;

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(nodeType, position);
    },
    [addNode, reactFlow]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    setDraggingNodeId(node.id);
  }, []);

  const handleNodeDrag = useCallback((_event: React.MouseEvent, node: Node) => {
    // Update dragging node ID to trigger helper lines recalculation
    setDraggingNodeId(node.id);
  }, []);

  const handleNodeDragStop = useCallback(() => {
    setDraggingNodeId(null);
  }, []);

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: unknown) => {
      const state = connectionState as {
        fromNode?: { id: string } | null;
        fromHandle?: { id?: string | null } | null;
      };
      const sourceNodeId = state.fromNode?.id;
      const sourceHandleId = state.fromHandle?.id;
      if (!sourceNodeId || !sourceHandleId) return;

      const target = event.target as HTMLElement;
      const nodeElement = target.closest('.react-flow__node');
      if (!nodeElement) return;

      const targetNodeId = nodeElement.getAttribute('data-id');
      if (!targetNodeId || targetNodeId === sourceNodeId) return;

      const droppedOnHandle = target.closest('.react-flow__handle');
      if (droppedOnHandle) return;

      const compatibleHandle = findCompatibleHandle(sourceNodeId, sourceHandleId, targetNodeId);
      if (!compatibleHandle) return;

      onConnect({
        source: sourceNodeId,
        sourceHandle: sourceHandleId,
        target: targetNodeId,
        targetHandle: compatibleHandle,
      });
    },
    [findCompatibleHandle, onConnect]
  );

  const checkValidConnection = useCallback(
    (connection: Connection | WorkflowEdge): boolean => {
      const conn: Connection = {
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? null,
        target: connection.target,
        targetHandle: connection.targetHandle ?? null,
      };
      return isValidConnection(conn);
    },
    [isValidConnection]
  );

  const handleMoveStart = useCallback(() => {
    if (!showMinimap) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsMinimapVisible(true);
  }, [showMinimap]);

  const handleMoveEnd = useCallback(() => {
    if (!showMinimap) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsMinimapVisible(false);
      hideTimeoutRef.current = null;
    }, MINIMAP_HIDE_DELAY);
  }, [showMinimap]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full h-full relative" onDrop={handleDrop} onDragOver={handleDragOver}>
      {!showPalette && (
        <button
          onClick={togglePalette}
          className="absolute top-3 left-3 z-10 p-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--secondary)] transition-colors group"
          title="Open sidebar (M)"
        >
          <PanelLeft className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
        </button>
      )}
      <ReactFlow<WorkflowNode, WorkflowEdge>
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={handleConnectEnd as never}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        isValidConnection={checkValidConnection}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        connectionMode={ConnectionMode.Loose}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1, 2]}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{
          animated: false,
          type: edgeStyle,
        }}
        edgesFocusable
        edgesReconnectable
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements={nodes.length > 50}
      >
        <GroupOverlay />
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="rgba(255, 255, 255, 0.08)"
        />
        <Controls />
        {showMinimap && (
          <MiniMap
            nodeStrokeWidth={0}
            nodeColor={() => DEFAULT_NODE_COLOR}
            zoomable
            pannable
            maskColor="rgba(0, 0, 0, 0.8)"
            className={`!bg-transparent !border-[var(--border)] !rounded-lg transition-opacity duration-300 ${
              isMinimapVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          />
        )}
        <HelperLines draggingNodeId={draggingNodeId} />
      </ReactFlow>
      {isContextMenuOpen && (
        <ContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
      <NodeDetailModal />
      <ShortcutHelpModal />
      <NodeSearch />
    </div>
  );
}
