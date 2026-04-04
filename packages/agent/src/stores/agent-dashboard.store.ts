import type { AgentUIBlock } from '@genfeedai/interfaces';
import { create } from 'zustand';

export const AGENT_DASHBOARD_STORAGE_KEY = 'genfeed-agent-dashboard-blocks';

export interface StoredDashboardState {
  blocks: AgentUIBlock[];
  isAgentModified: boolean;
}

function getStoredDashboardState(): StoredDashboardState {
  if (typeof window === 'undefined') {
    return { blocks: [], isAgentModified: false };
  }
  try {
    const stored = localStorage.getItem(AGENT_DASHBOARD_STORAGE_KEY);
    if (!stored) {
      return { blocks: [], isAgentModified: false };
    }
    return JSON.parse(stored) as StoredDashboardState;
  } catch {
    return { blocks: [], isAgentModified: false };
  }
}

function persistDashboardState(state: StoredDashboardState): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(AGENT_DASHBOARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

interface AgentDashboardState {
  blocks: AgentUIBlock[];
  isAgentModified: boolean;
}

interface AgentDashboardActions {
  getLocalSnapshot: () => StoredDashboardState;
  hydrateState: (state: StoredDashboardState) => void;
  setBlocks: (blocks: AgentUIBlock[]) => void;
  addBlock: (block: AgentUIBlock, index?: number) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (id: string, partial: Partial<AgentUIBlock>) => void;
  reorderBlocks: (ids: string[]) => void;
  resetToDefaults: () => void;
  clearAll: () => void;
}

export type AgentDashboardStore = AgentDashboardState & AgentDashboardActions;

const initialState: StoredDashboardState = {
  blocks: [],
  isAgentModified: false,
};

export const useAgentDashboardStore = create<AgentDashboardStore>((set) => ({
  addBlock: (block, index?) =>
    set((state) => {
      const blocks =
        index !== undefined
          ? [
              ...state.blocks.slice(0, index),
              block,
              ...state.blocks.slice(index),
            ]
          : [...state.blocks, block];
      const next = { blocks, isAgentModified: true };
      persistDashboardState(next);
      return next;
    }),
  blocks: initialState.blocks,

  clearAll: () => {
    const next = { blocks: [], isAgentModified: true };
    persistDashboardState(next);
    set(next);
  },

  getLocalSnapshot: () => getStoredDashboardState(),
  hydrateState: (state) => {
    const next = {
      blocks: state.blocks,
      isAgentModified: state.isAgentModified,
    };
    persistDashboardState(next);
    set(next);
  },
  isAgentModified: initialState.isAgentModified,

  removeBlock: (blockId) =>
    set((state) => {
      const blocks = state.blocks.filter((b) => b.id !== blockId);
      const next = { blocks, isAgentModified: state.isAgentModified };
      persistDashboardState(next);
      return next;
    }),

  reorderBlocks: (ids) =>
    set((state) => {
      const blockMap = new Map(state.blocks.map((b) => [b.id, b]));
      const blocks = ids
        .map((id) => blockMap.get(id))
        .filter((b): b is AgentUIBlock => b !== undefined);
      const next = { blocks, isAgentModified: state.isAgentModified };
      persistDashboardState(next);
      return next;
    }),

  resetToDefaults: () => {
    const next = { blocks: [], isAgentModified: false };
    persistDashboardState(next);
    set(next);
  },

  setBlocks: (blocks) => {
    const next = { blocks, isAgentModified: true };
    persistDashboardState(next);
    set(next);
  },

  updateBlock: (id, partial) =>
    set((state) => {
      const blocks = state.blocks.map((b) =>
        b.id === id ? ({ ...b, ...partial } as AgentUIBlock) : b,
      );
      const next = { blocks, isAgentModified: state.isAgentModified };
      persistDashboardState(next);
      return next;
    }),
}));
