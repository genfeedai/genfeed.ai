import type { StateCreator } from 'zustand';
import type { EditOperation } from '@/lib/chat/editOperations';
import type { WorkflowStore } from '../types';
import type { SnapshotSlice } from './snapshotSlice';

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
  applyChatEditOperations: (operations: EditOperation[]) => { applied: number; skipped: string[] };
}

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
