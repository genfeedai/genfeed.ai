import type {
  EdgeStyle,
  NodeType,
  ValidationResult,
  WorkflowEdge,
  WorkflowFile,
  WorkflowNode,
  WorkflowNodeData,
} from '@genfeedai/types';
import type { ChatSlice } from './slices/chatSlice';
import type { SnapshotSlice } from './slices/snapshotSlice';
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react';
import type { WorkflowData } from '@/lib/api';
import type { GroupColor, NodeGroup } from '@/types/groups';

// =============================================================================
// STATE TYPES
// =============================================================================

export interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;
  workflowName: string;
  workflowTags: string[];
  workflowId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  groups: NodeGroup[];
  selectedNodeIds: string[];
  viewedCommentIds: Set<string>;
  navigationTargetId: string | null;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export interface NodeActions {
  addNode: (type: NodeType, position: XYPosition) => string;
  addNodesAndEdges: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  updateNodeData: <T extends WorkflowNodeData>(nodeId: string, data: Partial<T>) => void;
  removeNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => string | null;
  propagateOutputsDownstream: (sourceNodeId: string, outputValue?: string) => void;
}

export interface ReactFlowActions {
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
}

export interface EdgeActions {
  removeEdge: (edgeId: string) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  toggleEdgePause: (edgeId: string) => void;
}

export interface LockingActions {
  _setNodeLockState: (predicate: (nodeId: string) => boolean, lock: boolean) => void;
  toggleNodeLock: (nodeId: string) => void;
  lockNode: (nodeId: string) => void;
  unlockNode: (nodeId: string) => void;
  lockMultipleNodes: (nodeIds: string[]) => void;
  unlockMultipleNodes: (nodeIds: string[]) => void;
  unlockAllNodes: () => void;
  isNodeLocked: (nodeId: string) => boolean;
}

export interface GroupActions {
  createGroup: (nodeIds: string[], name?: string) => string;
  deleteGroup: (groupId: string) => void;
  addToGroup: (groupId: string, nodeIds: string[]) => void;
  removeFromGroup: (groupId: string, nodeIds: string[]) => void;
  toggleGroupLock: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: GroupColor) => void;
  getGroupByNodeId: (nodeId: string) => NodeGroup | undefined;
  getGroupById: (groupId: string) => NodeGroup | undefined;
}

export interface SelectionActions {
  setSelectedNodeIds: (nodeIds: string[]) => void;
  addToSelection: (nodeId: string) => void;
  removeFromSelection: (nodeId: string) => void;
  clearSelection: () => void;
}

export interface LocalWorkflowActions {
  loadWorkflow: (workflow: WorkflowFile) => void;
  clearWorkflow: () => void;
  exportWorkflow: () => WorkflowFile;
}

export interface ApiActions {
  saveWorkflow: (signal?: AbortSignal) => Promise<WorkflowData>;
  loadWorkflowById: (id: string, signal?: AbortSignal) => Promise<void>;
  listWorkflows: (signal?: AbortSignal) => Promise<WorkflowData[]>;
  deleteWorkflow: (id: string, signal?: AbortSignal) => Promise<void>;
  duplicateWorkflowApi: (id: string, signal?: AbortSignal) => Promise<WorkflowData>;
  createNewWorkflow: (signal?: AbortSignal) => Promise<string>;
  setWorkflowName: (name: string) => void;
  setWorkflowTags: (tags: string[]) => void;
}

export interface HelperActions {
  getNodeById: (id: string) => WorkflowNode | undefined;
  getConnectedInputs: (nodeId: string) => Map<string, string | string[]>;
  getConnectedNodeIds: (nodeIds: string[]) => string[];
  validateWorkflow: () => ValidationResult;
  isValidConnection: (connection: Connection) => boolean;
  findCompatibleHandle: (
    sourceNodeId: string,
    sourceHandleId: string | null,
    targetNodeId: string
  ) => string | null;
  setDirty: (dirty: boolean) => void;
}

export interface CommentNavigationActions {
  getNodesWithComments: () => WorkflowNode[];
  markCommentViewed: (nodeId: string) => void;
  setNavigationTarget: (nodeId: string | null) => void;
  getUnviewedCommentCount: () => number;
}

// =============================================================================
// COMBINED STORE TYPE
// =============================================================================

export interface WorkflowStore
  extends WorkflowState,
    NodeActions,
    ReactFlowActions,
    EdgeActions,
    LockingActions,
    GroupActions,
    SelectionActions,
    LocalWorkflowActions,
    ApiActions,
    HelperActions,
    CommentNavigationActions,
    SnapshotSlice,
    ChatSlice {}
