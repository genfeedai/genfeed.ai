import { create } from 'zustand';

import type { ChatMessage, Thread } from '~models/chat.model';

interface ChatState {
  messages: ChatMessage[];
  threads: Thread[];
  activeThreadId: string | null;
  isGenerating: boolean;
  error: string | null;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setThreads: (threads: Thread[]) => void;
  setActiveThread: (id: string | null) => void;
  setIsGenerating: (generating: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  activeThreadId: null,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  error: null,
  isGenerating: false,
  messages: [],
  setActiveThread: (id) => set({ activeThreadId: id }),
  setError: (error) => set({ error }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setMessages: (messages) => set({ messages }),
  setThreads: (threads) => set({ threads }),
  threads: [],
}));
