import type {
  EdgeStyle,
  NodeGroup,
  WorkflowEdge,
  WorkflowNode,
} from '@genfeedai/types';

export interface EditOperation {
  type: 'add_node' | 'remove_node' | 'update_node' | 'add_edge' | 'remove_edge';
  [key: string]: unknown;
}

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
