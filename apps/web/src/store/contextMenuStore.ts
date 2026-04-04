import { create } from 'zustand';

export type ContextMenuType = 'node' | 'edge' | 'pane' | 'selection' | null;

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  menuType: ContextMenuType;
  targetId: string | null;
  targetIds: string[] | null;

  openNodeMenu: (nodeId: string, x: number, y: number) => void;
  openEdgeMenu: (edgeId: string, x: number, y: number) => void;
  openPaneMenu: (x: number, y: number) => void;
  openSelectionMenu: (nodeIds: string[], x: number, y: number) => void;
  close: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  close: () => {
    set({
      isOpen: false,
      menuType: null,
      targetId: null,
      targetIds: null,
    });
  },
  isOpen: false,
  menuType: null,

  openEdgeMenu: (edgeId, x, y) => {
    set({
      isOpen: true,
      menuType: 'edge',
      position: { x, y },
      targetId: edgeId,
      targetIds: null,
    });
  },

  openNodeMenu: (nodeId, x, y) => {
    set({
      isOpen: true,
      menuType: 'node',
      position: { x, y },
      targetId: nodeId,
      targetIds: null,
    });
  },

  openPaneMenu: (x, y) => {
    set({
      isOpen: true,
      menuType: 'pane',
      position: { x, y },
      targetId: null,
      targetIds: null,
    });
  },

  openSelectionMenu: (nodeIds, x, y) => {
    set({
      isOpen: true,
      menuType: 'selection',
      position: { x, y },
      targetId: null,
      targetIds: nodeIds,
    });
  },
  position: { x: 0, y: 0 },
  targetId: null,
  targetIds: null,
}));
