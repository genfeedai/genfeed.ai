import { create } from 'zustand';

interface PromptEditorStore {
  isOpen: boolean;
  nodeId: string | null;
  prompt: string;
  fontSize: number;

  openEditor: (nodeId: string, prompt: string) => void;
  closeEditor: () => void;
  setPrompt: (prompt: string) => void;
  setFontSize: (size: number) => void;
  saveAndClose: () => { nodeId: string; prompt: string } | null;
}

export const usePromptEditorStore = create<PromptEditorStore>((set, get) => ({
  closeEditor: () => {
    set({
      isOpen: false,
      nodeId: null,
      prompt: '',
    });
  },
  fontSize: 14,
  isOpen: false,
  nodeId: null,

  openEditor: (nodeId, prompt) => {
    set({
      isOpen: true,
      nodeId,
      prompt,
    });
  },
  prompt: '',

  saveAndClose: () => {
    const { nodeId, prompt } = get();
    if (!nodeId) return null;

    const result = { nodeId, prompt };

    set({
      isOpen: false,
      nodeId: null,
      prompt: '',
    });

    return result;
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
  },

  setPrompt: (prompt) => {
    set({ prompt });
  },
}));
