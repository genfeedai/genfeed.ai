import type { StateCreator } from 'zustand';
import type { WorkflowStore } from '../types';

export interface SelectionSlice {
  setSelectedNodeIds: (nodeIds: string[]) => void;
  addToSelection: (nodeId: string) => void;
  removeFromSelection: (nodeId: string) => void;
  clearSelection: () => void;
}

export const createSelectionSlice: StateCreator<WorkflowStore, [], [], SelectionSlice> = (set) => ({
  addToSelection: (nodeId) => {
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds
        : [...state.selectedNodeIds, nodeId],
    }));
  },

  clearSelection: () => {
    set({ selectedNodeIds: [] });
  },

  removeFromSelection: (nodeId) => {
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
    }));
  },
  setSelectedNodeIds: (nodeIds) => {
    set({ selectedNodeIds: nodeIds });
  },
});
