import { create } from 'zustand';
import type { ExtensionMessage } from '~types/extension';

// Tracks the pending action triggered by keyboard shortcuts or context menu
interface ExtensionModeState {
  pendingMessage: ExtensionMessage | null;
}

interface ExtensionModeActions {
  setPendingMessage: (message: ExtensionMessage | null) => void;
  clearPendingMessage: () => void;
}

export const useExtensionModeStore = create<
  ExtensionModeState & ExtensionModeActions
>((set) => ({
  clearPendingMessage: () => set({ pendingMessage: null }),
  pendingMessage: null,
  setPendingMessage: (message) => set({ pendingMessage: message }),
}));
