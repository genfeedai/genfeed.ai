'use client';

import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  Controls,
  type EdgeTypes,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import { PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
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
import { CostModal } from '../components/CostModal';
import { ContextMenu } from '../components/context-menu/ContextMenu';
import { GlobalImageHistory } from '../components/GlobalImageHistory';
import { MultiSelectToolbar } from '../components/MultiSelectToolbar';
import { NotificationToast } from '../components/NotificationToast';
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts';
import { useContextMenu } from '../hooks/useContextMenu';
import { createIdLookup, filterItemsByIdLookup } from '../lib';
import { nodeTypes as defaultNodeTypes } from '../nodes';
import { NodeDetailModal } from '../nodes/NodeDetailModal';
import { useExecutionStore } from '../stores/executionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { getHandleType } from '../stores/workflow/helpers/nodeHelpers';
import { useWorkflowStore } from '../stores/workflowStore';
import { ConnectionDropMenu } from './ConnectionDropMenu';
import { EdgeToolbar } from './EdgeToolbar';
import { EditableEdge } from './EditableEdge';
import { GroupOverlay } from './GroupOverlay';
import { HelperLines } from './HelperLines';
import { NodeSearch } from './NodeSearch';
import { ReferenceEdge } from './ReferenceEdge';
import { ShortcutHelpModal } from './ShortcutHelpModal';

const DEFAULT_NODE_COLOR = '#6b7280';

/**
 * Check if the model's schema supports image input
 * Used to determine whether to enable/disable image input handles
 */
function supportsImageInput(
  schema: Record<string, unknown> | undefined,
): boolean {
  if (!schema) return true; // Default to true if no schema

  const properties = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (!properties) return true;

  // Check for common image input field names across providers
  return !!(
    properties.image ||
    properties.image_input ||
    properties.image_url ||
    properties.image_urls ||
    properties.start_image ||
    properties.first_frame_image ||
    properties.reference_images
  );
}

function getEdgeDataType(
  edge: WorkflowEdge,
  nodeMap: Map<string, WorkflowNode>,
): HandleType | null {
  const sourceNode = nodeMap.get(edge.source);
  if (!sourceNode) return null;

  const nodeDef = NODE_DEFINITIONS[sourceNode.type as NodeType];
  if (!nodeDef) return null;

  const sourceHandle = nodeDef.outputs.find((h) => h.id === edge.sourceHandle);
  return sourceHandle?.type ?? null;
}

const edgeTypesMap: EdgeTypes = {
  bezier: EditableEdge,
  default: EditableEdge,
  reference: ReferenceEdge,
};

const MINIMAP_HIDE_DELAY = 1500;

interface StyledWorkflowEdgesOptions {
  activeNodeExecutions: ReturnType<
    typeof useExecutionStore.getState
  >['activeNodeExecutions'];
  currentNodeId: string | null;
  edges: WorkflowEdge[];
  executingNodeIds: string[];
  hasActiveNodeExecutions: boolean;
  highlightedNodeIds: string[];
  isRunning: boolean;
  nodes: WorkflowNode[];
}

function useStyledWorkflowEdges({
  activeNodeExecutions,
  currentNodeId,
  edges,
  executingNodeIds,
  hasActiveNodeExecutions,
  highlightedNodeIds,
  isRunning,
  nodes,
}: StyledWorkflowEdgesOptions) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const isEdgeTargetingDisabledInput = useCallback(
    (edge: WorkflowEdge): boolean => {
      const targetNode = nodeMap.get(edge.target);
      if (!targetNode) return false;

      if (targetNode.type === 'imageGen' && edge.targetHandle === 'images') {
        const nodeData = targetNode.data as ImageGenNodeData;
        return !supportsImageInput(nodeData?.selectedModel?.inputSchema);
      }

      if (
        targetNode.type === 'videoGen' &&
        (edge.targetHandle === 'image' || edge.targetHandle === 'lastFrame')
      ) {
        const nodeData = targetNode.data as VideoGenNodeData;
        return !supportsImageInput(nodeData?.selectedModel?.inputSchema);
      }

      return false;
    },
    [nodeMap],
  );

  const styledEdges = useMemo(() => {
    const executionScope =
      executingNodeIds.length > 0 ? new Set(executingNodeIds) : null;
    const highlightedSet =
      highlightedNodeIds.length > 0 ? new Set(highlightedNodeIds) : null;

    return edges.map((edge) => {
      const dataType = getEdgeDataType(edge, nodeMap);
      const typeClass = dataType ? `edge-${dataType}` : '';
      const isDisabledTarget = isEdgeTargetingDisabledInput(edge);
      const enrichedData = { ...edge.data, dataType };

      if (!isRunning && hasActiveNodeExecutions) {
        const isActiveEdge =
          activeNodeExecutions.has(edge.source) ||
          activeNodeExecutions.has(edge.target);

        if (isActiveEdge && !isDisabledTarget) {
          return {
            ...edge,
            animated: false,
            className: `${typeClass} executing`.trim(),
            data: enrichedData,
          };
        }
      }

      if (isRunning) {
        const isInExecutionScope =
          !executionScope ||
          executionScope.has(edge.source) ||
          executionScope.has(edge.target);
        const isExecutingEdge =
          currentNodeId &&
          (edge.source === currentNodeId || edge.target === currentNodeId);

        if (isDisabledTarget) {
          return {
            ...edge,
            animated: false,
            className: `${typeClass} edge-disabled`.trim(),
            data: enrichedData,
          };
        }

        if (!isInExecutionScope) {
          return {
            ...edge,
            animated: false,
            className: typeClass,
            data: enrichedData,
          };
        }

        return {
          ...edge,
          animated: false,
          className:
            `${typeClass} ${isExecutingEdge ? 'executing' : 'active-pipe'}`.trim(),
          data: enrichedData,
        };
      }

      if (isDisabledTarget) {
        return {
          ...edge,
          className: `${typeClass} edge-disabled`.trim(),
          data: enrichedData,
        };
      }

      if (highlightedSet) {
        const isConnected =
          highlightedSet.has(edge.source) && highlightedSet.has(edge.target);
        return {
          ...edge,
          className:
            `${typeClass} ${isConnected ? 'highlighted' : 'dimmed'}`.trim(),
          data: enrichedData,
        };
      }

      return {
        ...edge,
        className: typeClass,
        data: enrichedData,
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

  return { nodeMap, styledEdges };
}

function useSelectionHighlight({
  getConnectedNodeIds,
  selectedNodeIds,
  setHighlightedNodeIds,
}: {
  getConnectedNodeIds: (ids: string[]) => string[];
  selectedNodeIds: string[];
  setHighlightedNodeIds: (ids: string[]) => void;
}) {
  useEffect(() => {
    if (selectedNodeIds.length === 0) {
      setHighlightedNodeIds([]);
      return;
    }

    setHighlightedNodeIds(getConnectedNodeIds(selectedNodeIds));
  }, [selectedNodeIds, getConnectedNodeIds, setHighlightedNodeIds]);
}

function useMinimapVisibility(showMinimap: boolean) {
  const [isMinimapVisible, setIsMinimapVisible] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  return { handleMoveEnd, handleMoveStart, isMinimapVisible };
}

interface WorkflowCanvasHandlersOptions {
  addNode: ReturnType<typeof useWorkflowStore.getState>['addNode'];
  createGroup: ReturnType<typeof useWorkflowStore.getState>['createGroup'];
  deleteGroup: ReturnType<typeof useWorkflowStore.getState>['deleteGroup'];
  edges: WorkflowEdge[];
  findCompatibleHandle: (
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
  ) => string | null;
  groups: ReturnType<typeof useWorkflowStore.getState>['groups'];
  isValidConnection: (connection: Connection) => boolean;
  nodeMap: Map<string, WorkflowNode>;
  nodes: WorkflowNode[];
  onConnect: ReturnType<typeof useWorkflowStore.getState>['onConnect'];
  onEdgesChange: ReturnType<typeof useWorkflowStore.getState>['onEdgesChange'];
  onNodesChange: ReturnType<typeof useWorkflowStore.getState>['onNodesChange'];
  openConnectionDropMenu: ReturnType<
    typeof useUIStore.getState
  >['openConnectionDropMenu'];
  openEdgeMenu: (edgeId: string, x: number, y: number) => void;
  openModal: ReturnType<typeof useUIStore.getState>['openModal'];
  openNodeMenu: (nodeId: string, x: number, y: number) => void;
  openPaneMenu: (x: number, y: number) => void;
  openSelectionMenu: (nodeIds: string[], x: number, y: number) => void;
  reactFlow: ReturnType<typeof useReactFlow>;
  selectEdge: (id: string | null) => void;
  selectedNodeIds: string[];
  selectNode: (id: string | null) => void;
  setDraggingNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  toggleNodeLock: (id: string) => void;
  togglePalette: () => void;
  unlockAllNodes: () => void;
}

function useWorkflowCanvasHandlers({
  addNode,
  createGroup,
  deleteGroup,
  edges,
  findCompatibleHandle,
  groups,
  isValidConnection,
  nodeMap,
  nodes,
  onConnect,
  onEdgesChange,
  onNodesChange,
  openConnectionDropMenu,
  openEdgeMenu,
  openModal,
  openNodeMenu,
  openPaneMenu,
  openSelectionMenu,
  reactFlow,
  selectEdge,
  selectedNodeIds,
  selectNode,
  setDraggingNodeId,
  setSelectedNodeIds,
  toggleNodeLock,
  togglePalette,
  unlockAllNodes,
}: WorkflowCanvasHandlersOptions) {
  const selectedNodeIdLookup = useMemo(
    () => createIdLookup(selectedNodeIds),
    [selectedNodeIds],
  );

  const openShortcutHelp = useCallback(
    () => openModal('shortcutHelp'),
    [openModal],
  );
  const openNodeSearch = useCallback(
    () => openModal('nodeSearch'),
    [openModal],
  );

  const deleteSelectedElements = useCallback(() => {
    const nodesToDelete = filterItemsByIdLookup(nodes, selectedNodeIdLookup);
    const edgesToDelete = edges.filter((e) => e.selected);
    if (nodesToDelete.length > 0) {
      onNodesChange(
        nodesToDelete.map((n) => ({ id: n.id, type: 'remove' as const })),
      );
    }
    if (edgesToDelete.length > 0) {
      onEdgesChange(
        edgesToDelete.map((e) => ({ id: e.id, type: 'remove' as const })),
      );
    }
  }, [nodes, edges, selectedNodeIdLookup, onNodesChange, onEdgesChange]);

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

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: WorkflowNode) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
    setSelectedNodeIds([]);
  }, [selectNode, selectEdge, setSelectedNodeIds]);

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: WorkflowEdge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    [setSelectedNodeIds],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (selectedNodeIds.length > 1 && selectedNodeIdLookup.has(node.id)) {
        openSelectionMenu(selectedNodeIds, event.clientX, event.clientY);
      } else {
        openNodeMenu(node.id, event.clientX, event.clientY);
      }
    },
    [selectedNodeIdLookup, selectedNodeIds, openNodeMenu, openSelectionMenu],
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: WorkflowEdge) => {
      event.preventDefault();
      openEdgeMenu(edge.id, event.clientX, event.clientY);
    },
    [openEdgeMenu],
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      openPaneMenu(event.clientX, event.clientY);
    },
    [openPaneMenu],
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent, selectedNodes: Node[]) => {
      event.preventDefault();
      const nodeIds = selectedNodes.map((n) => n.id);
      openSelectionMenu(nodeIds, event.clientX, event.clientY);
    },
    [openSelectionMenu],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const historyData = event.dataTransfer.getData(
        'application/history-image',
      );
      if (historyData) {
        try {
          const parsed = JSON.parse(historyData) as {
            image: string;
            prompt?: string;
          };
          const position = reactFlow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const nodeId = addNode('imageInput' as NodeType, position);
          if (nodeId && parsed.image) {
            useWorkflowStore
              .getState()
              .updateNodeData(nodeId, { outputImage: parsed.image });
          }
        } catch {
          // Invalid history data
        }
        return;
      }

      const nodeType = event.dataTransfer.getData('nodeType') as NodeType;
      if (!nodeType) return;

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(nodeType, position);
    },
    [addNode, reactFlow],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      setDraggingNodeId(node.id);
    },
    [setDraggingNodeId],
  );

  const handleNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      setDraggingNodeId(node.id);
    },
    [setDraggingNodeId],
  );

  const handleNodeDragStop = useCallback(() => {
    setDraggingNodeId(null);
  }, [setDraggingNodeId]);

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: unknown) => {
      const state = connectionState as {
        fromHandle?: { id?: string | null } | null;
        fromNode?: { id: string } | null;
      };
      const sourceNodeId = state.fromNode?.id;
      const sourceHandleId = state.fromHandle?.id;
      if (!sourceNodeId || !sourceHandleId) return;

      const target = event.target as HTMLElement;
      const nodeElement = target.closest('.react-flow__node');

      if (!nodeElement) {
        const sourceNode = nodeMap.get(sourceNodeId);
        if (!sourceNode) return;

        const sourceHandleType = getHandleType(
          sourceNode.type as NodeType,
          sourceHandleId,
          'source',
        );
        if (!sourceHandleType) return;

        const clientX =
          'clientX' in event
            ? event.clientX
            : (event.touches?.[0]?.clientX ?? 0);
        const clientY =
          'clientY' in event
            ? event.clientY
            : (event.touches?.[0]?.clientY ?? 0);

        openConnectionDropMenu({
          position: reactFlow.screenToFlowPosition({ x: clientX, y: clientY }),
          screenPosition: { x: clientX, y: clientY },
          sourceHandleId,
          sourceHandleType,
          sourceNodeId,
        });
        return;
      }

      const targetNodeId = nodeElement.getAttribute('data-id');
      if (!targetNodeId || targetNodeId === sourceNodeId) return;
      if (target.closest('.react-flow__handle')) return;

      const compatibleHandle = findCompatibleHandle(
        sourceNodeId,
        sourceHandleId,
        targetNodeId,
      );
      if (!compatibleHandle) return;

      onConnect({
        source: sourceNodeId,
        sourceHandle: sourceHandleId,
        target: targetNodeId,
        targetHandle: compatibleHandle,
      });
    },
    [
      findCompatibleHandle,
      nodeMap,
      onConnect,
      openConnectionDropMenu,
      reactFlow,
    ],
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
    [isValidConnection],
  );

  return {
    checkValidConnection,
    handleConnectEnd,
    handleDragOver,
    handleDrop,
    handleEdgeClick,
    handleEdgeContextMenu,
    handleNodeClick,
    handleNodeContextMenu,
    handleNodeDrag,
    handleNodeDragStart,
    handleNodeDragStop,
    handlePaneClick,
    handlePaneContextMenu,
    handleSelectionChange,
    handleSelectionContextMenu,
  };
}

interface WorkflowCanvasProps {
  /** Override default node types. Pass merged core + cloud nodeTypes here. */
  nodeTypes?: NodeTypes;
  /** Optional callback for download-as-ZIP of selected nodes */
  onDownloadAsZip?: (nodes: WorkflowNode[]) => void;
}

export function WorkflowCanvas({
  nodeTypes: nodeTypesProp,
  onDownloadAsZip,
}: WorkflowCanvasProps = {}) {
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
    selectEdge,
    setHighlightedNodeIds,
    highlightedNodeIds,
    showPalette,
    togglePalette,
    openModal,
    openConnectionDropMenu,
  } = useUIStore();
  const reactFlow = useReactFlow();
  const { edgeStyle, showMinimap } = useSettingsStore();
  const isRunning = useExecutionStore((state) => state.isRunning);
  const currentNodeId = useExecutionStore((state) => state.currentNodeId);
  const executingNodeIds = useExecutionStore((state) => state.executingNodeIds);
  const activeNodeExecutions = useExecutionStore(
    (state) => state.activeNodeExecutions,
  );
  const hasActiveNodeExecutions = useExecutionStore(
    (state) => state.activeNodeExecutions.size > 0,
  );

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

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

  useSelectionHighlight({
    getConnectedNodeIds,
    selectedNodeIds,
    setHighlightedNodeIds,
  });

  const { nodeMap, styledEdges } = useStyledWorkflowEdges({
    activeNodeExecutions,
    currentNodeId,
    edges,
    executingNodeIds,
    hasActiveNodeExecutions,
    highlightedNodeIds,
    isRunning,
    nodes,
  });

  const { handleMoveEnd, handleMoveStart, isMinimapVisible } =
    useMinimapVisibility(showMinimap);

  const {
    checkValidConnection,
    handleConnectEnd,
    handleDragOver,
    handleDrop,
    handleEdgeClick,
    handleEdgeContextMenu,
    handleNodeClick,
    handleNodeContextMenu,
    handleNodeDrag,
    handleNodeDragStart,
    handleNodeDragStop,
    handlePaneClick,
    handlePaneContextMenu,
    handleSelectionChange,
    handleSelectionContextMenu,
  } = useWorkflowCanvasHandlers({
    addNode,
    createGroup,
    deleteGroup,
    edges,
    findCompatibleHandle,
    groups,
    isValidConnection,
    nodeMap,
    nodes,
    onConnect,
    onEdgesChange,
    onNodesChange,
    openConnectionDropMenu,
    openEdgeMenu,
    openModal,
    openNodeMenu,
    openPaneMenu,
    openSelectionMenu,
    reactFlow,
    selectEdge,
    selectedNodeIds,
    selectNode,
    setDraggingNodeId,
    setSelectedNodeIds,
    toggleNodeLock,
    togglePalette,
    unlockAllNodes,
  });

  return (
    <div
      role="application"
      className="size-full relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {!showPalette && (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={togglePalette}
          className="absolute top-3 left-3 z-10"
          title="Open sidebar (M)"
        >
          <PanelLeft className="size-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
        </Button>
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
        onEdgeClick={handleEdgeClick}
        isValidConnection={checkValidConnection}
        nodeTypes={nodeTypesProp ?? defaultNodeTypes}
        edgeTypes={edgeTypesMap}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.1}
        maxZoom={4}
        nodeDragThreshold={5}
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
            className={`!bg-transparent !border-[var(--border)] transition-opacity duration-300 ${
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
      <EdgeToolbar />
      <MultiSelectToolbar onDownloadAsZip={onDownloadAsZip} />
      <NodeDetailModal />
      <ShortcutHelpModal />
      <NodeSearch />
      <ConnectionDropMenu />
      <CostModal />
      <NotificationToast />
      <GlobalImageHistory />
    </div>
  );
}
