import { create } from 'zustand';

interface SettingsState {
  autoFill: boolean;
  autoPost: boolean;
  isLoaded: boolean;
}

interface SettingsActions {
  setAutoFill: (autoFill: boolean) => void;
  setAutoPost: (autoPost: boolean) => void;
  loadSettings: () => Promise<void>;
}

const STORAGE_KEY = 'genfeed-settings';

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set) => ({
    autoFill: false,
    autoPost: false,
    isLoaded: false,

    loadSettings: async () => {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const settings = result[STORAGE_KEY];
      if (settings) {
        set({
          autoFill: settings.autoFill ?? false,
          autoPost: settings.autoPost ?? false,
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    },

    setAutoFill: (autoFill) => {
      set({ autoFill });
      const { autoPost } = useSettingsStore.getState();
      chrome.storage.local.set({
        [STORAGE_KEY]: { autoFill, autoPost },
      });
    },

    setAutoPost: (autoPost) => {
      set({ autoPost });
      const { autoFill } = useSettingsStore.getState();
      chrome.storage.local.set({
        [STORAGE_KEY]: { autoFill, autoPost },
      });
    },
  }),
);
