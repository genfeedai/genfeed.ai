import type { StateCreator } from 'zustand';
import type { WorkflowStore } from '../types';
import type { ChatSlice, SnapshotSlice } from './types';

export const createChatSlice: StateCreator<
  WorkflowStore & SnapshotSlice & ChatSlice,
  [],
  [],
  ChatSlice
> = (set, get) => ({
  addChatMessage: (role, content) => {
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          content,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  applyChatEditOperations: (operations) => {
    const state = get();

    // Capture snapshot before AI edits for one-click revert
    state.captureSnapshot();

    return state.applyEditOperations(operations);
  },
  chatMessages: [],

  clearChatMessages: () => {
    set({ chatMessages: [] });
  },
  isChatOpen: false,

  setChatOpen: (open) => {
    set({ isChatOpen: open });
  },

  toggleChat: () => {
    set((state) => ({ isChatOpen: !state.isChatOpen }));
  },
});
