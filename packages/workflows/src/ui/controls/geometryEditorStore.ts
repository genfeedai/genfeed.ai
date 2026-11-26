import { create } from 'zustand';
import type { GeometryEditorMode } from './GeometryEditorDialog';

export interface GeometryEditorTarget {
  mode: GeometryEditorMode;
  nodeId: string;
}

interface GeometryEditorStore {
  closeEditor: () => void;
  /**
   * An empty path is only an error once a run has been tried; until then it is just not drawn yet.
   */
  hasAttemptedRun: boolean;
  markRunAttempted: () => void;
  openEditor: (target: GeometryEditorTarget) => void;
  target: GeometryEditorTarget | null;
}

/** Which geometry editor is open. Nodes and the inspector open it; one host renders it. */
export const useGeometryEditorStore = create<GeometryEditorStore>((set) => ({
  closeEditor: () => set({ target: null }),
  hasAttemptedRun: false,
  markRunAttempted: () => set({ hasAttemptedRun: true }),
  openEditor: (target) => set({ target }),
  target: null,
}));
