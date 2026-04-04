import type {
  EdgeStyle,
  NodeGroup,
  WorkflowEdge,
  WorkflowNode,
} from '@genfeedai/types';
import type { StateCreator } from 'zustand';
import type { WorkflowStore } from '../types';

/**
 * EditOperation type inlined from @/lib/chat/editOperations.
 * The consuming app provides the actual applyEditOperations implementation.
 */
export interface EditOperation {
  type: 'add_node' | 'remove_node' | 'update_node' | 'add_edge' | 'remove_edge';
  [key: string]: unknown;
}

/**
 * Stub applyEditOperations - consuming app should override via the store creator.
 * Returns unchanged nodes/edges by default.
 */
function defaultApplyEditOperations(
  _operations: EditOperation[],
  state: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  applied: number;
  skipped: string[];
} {
  return { applied: 0, edges: state.edges, nodes: state.nodes, skipped: [] };
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

export const createSnapshotSlice: StateCreator<
  WorkflowStore & SnapshotSlice,
  [],
  [],
  SnapshotSlice
> = (set, get) => ({
  applyEditOperations: (operations) => {
    const state = get();
    const result = defaultApplyEditOperations(operations, {
      edges: state.edges,
      nodes: state.nodes,
    });

    set({
      edges: result.edges,
      isDirty: true,
      nodes: result.nodes,
    });

    return { applied: result.applied, skipped: result.skipped };
  },

  captureSnapshot: () => {
    const state = get();
    const snapshot: WorkflowSnapshot = {
      edgeStyle: state.edgeStyle,
      edges: JSON.parse(JSON.stringify(state.edges)),
      groups: JSON.parse(JSON.stringify(state.groups)),
      nodes: JSON.parse(JSON.stringify(state.nodes)),
    };
    set({
      manualChangeCount: 0,
      previousWorkflowSnapshot: snapshot,
    });
  },

  clearSnapshot: () => {
    set({
      manualChangeCount: 0,
      previousWorkflowSnapshot: null,
    });
  },

  incrementManualChangeCount: () => {
    const state = get();
    const newCount = state.manualChangeCount + 1;

    // Automatically clear snapshot after 3 manual changes
    if (newCount >= 3) {
      set({
        manualChangeCount: 0,
        previousWorkflowSnapshot: null,
      });
    } else {
      set({ manualChangeCount: newCount });
    }
  },
  manualChangeCount: 0,
  previousWorkflowSnapshot: null,

  revertToSnapshot: () => {
    const state = get();
    if (state.previousWorkflowSnapshot) {
      set({
        edgeStyle: state.previousWorkflowSnapshot.edgeStyle,
        edges: state.previousWorkflowSnapshot.edges,
        groups: state.previousWorkflowSnapshot.groups,
        isDirty: true,
        manualChangeCount: 0,
        nodes: state.previousWorkflowSnapshot.nodes,
        previousWorkflowSnapshot: null,
      });
    }
  },
});
