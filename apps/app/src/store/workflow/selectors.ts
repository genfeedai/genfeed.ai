import type { WorkflowStore } from './types';

/**
 * Stable Zustand Selectors
 *
 * Pre-defined selectors to avoid inline function recreation in components.
 * Using stable selector references prevents unnecessary re-subscriptions
 * and improves React Flow performance.
 *
 * Usage:
 *   import { selectNodes, selectUpdateNodeData } from '@/store/workflow/selectors';
 *   const nodes = useWorkflowStore(selectNodes);
 *   const updateNodeData = useWorkflowStore(selectUpdateNodeData);
 */

// =============================================================================
// STATE SELECTORS
// =============================================================================

/** Select all nodes */
export const selectNodes = (state: WorkflowStore) => state.nodes;

/** Select all edges */
export const selectEdges = (state: WorkflowStore) => state.edges;

/** Select all groups */
export const selectGroups = (state: WorkflowStore) => state.groups;

/** Select selected node IDs */
export const selectSelectedNodeIds = (state: WorkflowStore) => state.selectedNodeIds;

/** Select workflow name */
export const selectWorkflowName = (state: WorkflowStore) => state.workflowName;

/** Select workflow ID */
export const selectWorkflowId = (state: WorkflowStore) => state.workflowId;

/** Select dirty state */
export const selectIsDirty = (state: WorkflowStore) => state.isDirty;

/** Select saving state */
export const selectIsSaving = (state: WorkflowStore) => state.isSaving;

/** Select loading state */
export const selectIsLoading = (state: WorkflowStore) => state.isLoading;

/** Select edge style */
export const selectEdgeStyle = (state: WorkflowStore) => state.edgeStyle;

/** Select navigation target ID */
export const selectNavigationTargetId = (state: WorkflowStore) => state.navigationTargetId;

// =============================================================================
// ACTION SELECTORS
// =============================================================================

/** Select updateNodeData action */
export const selectUpdateNodeData = (state: WorkflowStore) => state.updateNodeData;

/** Select addNode action */
export const selectAddNode = (state: WorkflowStore) => state.addNode;

/** Select removeNode action */
export const selectRemoveNode = (state: WorkflowStore) => state.removeNode;

/** Select duplicateNode action */
export const selectDuplicateNode = (state: WorkflowStore) => state.duplicateNode;

/** Select onNodesChange action */
export const selectOnNodesChange = (state: WorkflowStore) => state.onNodesChange;

/** Select onEdgesChange action */
export const selectOnEdgesChange = (state: WorkflowStore) => state.onEdgesChange;

/** Select onConnect action */
export const selectOnConnect = (state: WorkflowStore) => state.onConnect;

/** Select setSelectedNodeIds action */
export const selectSetSelectedNodeIds = (state: WorkflowStore) => state.setSelectedNodeIds;

/** Select toggleNodeLock action */
export const selectToggleNodeLock = (state: WorkflowStore) => state.toggleNodeLock;

/** Select createGroup action */
export const selectCreateGroup = (state: WorkflowStore) => state.createGroup;

/** Select deleteGroup action */
export const selectDeleteGroup = (state: WorkflowStore) => state.deleteGroup;

/** Select unlockAllNodes action */
export const selectUnlockAllNodes = (state: WorkflowStore) => state.unlockAllNodes;

/** Select setDirty action */
export const selectSetDirty = (state: WorkflowStore) => state.setDirty;

/** Select removeEdge action */
export const selectRemoveEdge = (state: WorkflowStore) => state.removeEdge;

/** Select addNodesAndEdges action */
export const selectAddNodesAndEdges = (state: WorkflowStore) => state.addNodesAndEdges;

// =============================================================================
// HELPER SELECTORS
// =============================================================================

/** Select getNodeById helper */
export const selectGetNodeById = (state: WorkflowStore) => state.getNodeById;

/** Select getConnectedNodeIds helper */
export const selectGetConnectedNodeIds = (state: WorkflowStore) => state.getConnectedNodeIds;

/** Select isValidConnection helper */
export const selectIsValidConnection = (state: WorkflowStore) => state.isValidConnection;

/** Select findCompatibleHandle helper */
export const selectFindCompatibleHandle = (state: WorkflowStore) => state.findCompatibleHandle;

// =============================================================================
// PARAMETERIZED SELECTORS (Factory Functions)
// =============================================================================

/**
 * Create a selector for a specific node by ID
 * Note: Creates new function each call - memoize at call site if needed
 */
export const createSelectNodeById = (id: string) => (state: WorkflowStore) =>
  state.nodes.find((n) => n.id === id);

/**
 * Create a selector for checking if a node is in selection
 */
export const createSelectIsNodeSelected = (id: string) => (state: WorkflowStore) =>
  state.selectedNodeIds.includes(id);

/**
 * Create a selector for a group containing a node
 */
export const createSelectGroupByNodeId = (nodeId: string) => (state: WorkflowStore) =>
  state.groups.find((g) => g.nodeIds.includes(nodeId));
