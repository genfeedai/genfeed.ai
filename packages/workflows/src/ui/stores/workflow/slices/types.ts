import type {
  EdgeStyle,
  NodeGroup,
  NodeType,
  WorkflowEdge,
  WorkflowNode,
} from '@genfeedai/types';

/**
 * A single atomic change to the workflow graph. Canonical shape shared with the
 * app's chat/agent edit pipeline — the `applyEditOperations` implementation is
 * injected (see WorkflowUIConfig.applyEditOperations); this package defaults to
 * a no-op when unconfigured.
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

/** Result of applying a batch of {@link EditOperation}s. */
export interface ApplyEditResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  applied: number;
  skipped: string[];
}

/**
 * Applies a batch of edit operations to the current graph and returns the new
 * nodes/edges plus how many applied / which were skipped. Injected by the app;
 * defaults to a no-op that leaves the graph untouched.
 */
export type ApplyEditOperations = (
  operations: EditOperation[],
  state: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
) => ApplyEditResult;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSlice {
  chatMessages: ChatMessage[];
  isChatOpen: boolean;
  addChatMessage: (role: 'user' | 'assistant', content: string) => void;
  clearChatMessages: () => void;
  toggleChat: () => void;
  setChatOpen: (open: boolean) => void;
  applyChatEditOperations: (operations: EditOperation[]) => {
    applied: number;
    skipped: string[];
  };
}

export interface WorkflowSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: NodeGroup[];
  edgeStyle: EdgeStyle;
}

export interface SnapshotSlice {
  previousWorkflowSnapshot: WorkflowSnapshot | null;
  manualChangeCount: number;
  captureSnapshot: () => void;
  revertToSnapshot: () => void;
  clearSnapshot: () => void;
  incrementManualChangeCount: () => void;
  applyEditOperations: (operations: EditOperation[]) => {
    applied: number;
    skipped: string[];
  };
}
