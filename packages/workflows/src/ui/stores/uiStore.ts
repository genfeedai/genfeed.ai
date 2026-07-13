import type { HandleType } from '@genfeedai/types';
import { create } from 'zustand';

export type ModalType =
  | 'templates'
  | 'cost'
  | 'welcome'
  | 'settings'
  | 'promptLibrary'
  | 'modelBrowser'
  | 'nodeDetail'
  | 'shortcutHelp'
  | 'nodeSearch'
  | null;

export type NodeDetailTab = 'preview' | 'history';

export interface ConnectionDropMenuState {
  position: { x: number; y: number };
  screenPosition: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string;
  sourceHandleType: HandleType;
}

interface UIStore {
  // Panel visibility
  showPalette: boolean;
  showMinimap: boolean;
  showAIGenerator: boolean;
  showDebugPanel: boolean;

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // Focus mode (highlight connected nodes)
  highlightedNodeIds: string[];

  // Modals
  activeModal: ModalType;

  // Connection drop menu
  connectionDropMenu: ConnectionDropMenuState | null;

  // Node detail modal
  nodeDetailNodeId: string | null;
  nodeDetailActiveTab: NodeDetailTab;
  nodeDetailStartIndex: number;

  // Notifications
  notifications: Notification[];

  // Actions
  togglePalette: () => void;
  toggleMinimap: () => void;
  toggleAIGenerator: () => void;
  toggleDebugPanel: () => void;
  setShowDebugPanel: (show: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setHighlightedNodeIds: (ids: string[]) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  openConnectionDropMenu: (params: ConnectionDropMenuState) => void;
  closeConnectionDropMenu: () => void;
  openNodeDetailModal: (
    nodeId: string,
    tab?: NodeDetailTab,
    startIndex?: number,
  ) => void;
  closeNodeDetailModal: () => void;
  setNodeDetailTab: (tab: NodeDetailTab) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

let notificationId = 0;

export const useUIStore = create<UIStore>((set) => ({
  activeModal: null,

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`;
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));

    // Auto-remove after duration
    if (notification.duration !== 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, notification.duration ?? 5000);
    }
  },

  closeConnectionDropMenu: () => {
    set({ connectionDropMenu: null });
  },

  closeModal: () => {
    set({ activeModal: null });
  },

  closeNodeDetailModal: () => {
    set({
      activeModal: null,
      nodeDetailActiveTab: 'preview',
      nodeDetailNodeId: null,
      nodeDetailStartIndex: 0,
    });
  },
  connectionDropMenu: null,
  highlightedNodeIds: [],
  nodeDetailActiveTab: 'preview',
  nodeDetailNodeId: null,
  nodeDetailStartIndex: 0,
  notifications: [],

  openConnectionDropMenu: (params) => {
    set({ connectionDropMenu: params });
  },

  openModal: (modal) => {
    set({ activeModal: modal });
  },

  openNodeDetailModal: (nodeId, tab = 'preview', startIndex = 0) => {
    set({
      activeModal: 'nodeDetail',
      nodeDetailActiveTab: tab,
      nodeDetailNodeId: nodeId,
      nodeDetailStartIndex: startIndex,
    });
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  selectEdge: (edgeId) => {
    set({ selectedEdgeId: edgeId, selectedNodeId: null });
  },
  selectedEdgeId: null,
  selectedNodeId: null,

  selectNode: (nodeId) => {
    set({ selectedEdgeId: null, selectedNodeId: nodeId });
  },

  setHighlightedNodeIds: (ids) => {
    set({ highlightedNodeIds: ids });
  },

  setNodeDetailTab: (tab) => {
    set({ nodeDetailActiveTab: tab });
  },

  setShowDebugPanel: (show) => {
    set({ showDebugPanel: show });
  },
  showAIGenerator: false,
  showDebugPanel: false,
  showMinimap: true,
  showPalette: true,

  toggleAIGenerator: () => {
    set((state) => ({ showAIGenerator: !state.showAIGenerator }));
  },

  toggleDebugPanel: () => {
    set((state) => ({ showDebugPanel: !state.showDebugPanel }));
  },

  toggleMinimap: () => {
    set((state) => ({ showMinimap: !state.showMinimap }));
  },

  togglePalette: () => {
    set((state) => ({ showPalette: !state.showPalette }));
  },
}));
