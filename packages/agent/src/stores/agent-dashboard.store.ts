import { parseAgentDashboardBlocks } from '@genfeedai/agent/dashboard/dashboard-openui';
import type { AgentUIBlock } from '@genfeedai/interfaces';
import { create } from 'zustand';

export const AGENT_DASHBOARD_STORAGE_KEY = 'genfeed-agent-dashboard-blocks';

export interface StoredDashboardState {
  blocks: AgentUIBlock[];
  isAgentModified: boolean;
}

const initialState: StoredDashboardState = {
  blocks: [],
  isAgentModified: false,
};

function isStoredDashboardState(value: unknown): value is {
  blocks?: unknown;
  isAgentModified?: unknown;
} {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStoredDashboardState(value: unknown): StoredDashboardState {
  if (!isStoredDashboardState(value)) {
    return initialState;
  }

  const parsed = parseAgentDashboardBlocks(value.blocks ?? []);
  return {
    blocks: parsed.blocks,
    isAgentModified: parsed.ok ? value.isAgentModified === true : true,
  };
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
    return normalizeStoredDashboardState(JSON.parse(stored) as unknown);
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

export const useAgentDashboardStore = create<AgentDashboardStore>((set) => ({
  addBlock: (block, index?) =>
    set((state) => {
      const rawBlocks =
        index !== undefined
          ? [
              ...state.blocks.slice(0, index),
              block,
              ...state.blocks.slice(index),
            ]
          : [...state.blocks, block];
      const parsed = parseAgentDashboardBlocks(rawBlocks);
      const next = { blocks: parsed.blocks, isAgentModified: true };
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
    const next = normalizeStoredDashboardState(state);
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
      const blocks = ids.reduce<AgentUIBlock[]>((acc, id) => {
        const b = blockMap.get(id);
        if (b !== undefined) {
          acc.push(b);
        }
        return acc;
      }, []);
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
    const parsed = parseAgentDashboardBlocks(blocks);
    const next = { blocks: parsed.blocks, isAgentModified: true };
    persistDashboardState(next);
    set(next);
  },

  updateBlock: (id, partial) =>
    set((state) => {
      const rawBlocks = state.blocks.map((b) =>
        b.id === id ? ({ ...b, ...partial } as AgentUIBlock) : b,
      );
      const parsed = parseAgentDashboardBlocks(rawBlocks);
      const next = {
        blocks: parsed.blocks,
        isAgentModified: parsed.ok ? state.isAgentModified : true,
      };
      persistDashboardState(next);
      return next;
    }),
}));
