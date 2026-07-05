import type { StateCreator } from 'zustand';
import { getApplyEditOperations } from '../applyEditOperations';
import type { WorkflowStore } from '../types';
import type { SnapshotSlice, WorkflowSnapshot } from './types';

export const createSnapshotSlice: StateCreator<
  WorkflowStore & SnapshotSlice,
  [],
  [],
  SnapshotSlice
> = (set, get) => ({
  applyEditOperations: (operations) => {
    const state = get();
    const result = getApplyEditOperations()(operations, {
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
