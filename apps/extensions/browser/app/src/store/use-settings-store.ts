import {
  DEFAULT_THEME,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { create } from 'zustand';
import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  readStoredTheme,
} from '~theme/theme-storage';
import { logger } from '~utils/logger.util';

interface SettingsState {
  autoFill: boolean;
  autoPost: boolean;
  isLoaded: boolean;
  settingsRevision: number;
  theme: ThemePreference;
  themeRevision: number;
}

interface SettingsActions {
  applyStoredSettings: (settings: unknown) => void;
  applyAccountTheme: (theme: ThemePreference) => void;
  setAutoFill: (autoFill: boolean) => void;
  setAutoPost: (autoPost: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  loadSettings: () => Promise<void>;
}

export { EXTENSION_SETTINGS_STORAGE_KEY } from '~theme/theme-storage';

interface PersistedExtensionSettings {
  autoFill: boolean;
  autoPost: boolean;
  theme: ThemePreference;
}

function normalizeSettings(settings: unknown): PersistedExtensionSettings {
  const candidate =
    typeof settings === 'object' && settings !== null
      ? (settings as Record<string, unknown>)
      : {};

  return {
    autoFill:
      typeof candidate.autoFill === 'boolean' ? candidate.autoFill : false,
    autoPost:
      typeof candidate.autoPost === 'boolean' ? candidate.autoPost : false,
    theme: readStoredTheme(candidate),
  };
}

function persistSettings(settings: PersistedExtensionSettings): void {
  void chrome.storage.local.set({
    [EXTENSION_SETTINGS_STORAGE_KEY]: settings,
  });
}

function currentPersistedSettings(): PersistedExtensionSettings {
  const { autoFill, autoPost, theme } = useSettingsStore.getState();
  return { autoFill, autoPost, theme };
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set, get) => ({
    autoFill: false,
    autoPost: false,
    isLoaded: false,
    settingsRevision: 0,
    theme: DEFAULT_THEME,
    themeRevision: 0,

    applyAccountTheme: (theme) => {
      set({ theme });
      persistSettings(currentPersistedSettings());
    },

    applyStoredSettings: (settings) => {
      const normalizedSettings = normalizeSettings(settings);
      set((state) => ({
        ...normalizedSettings,
        isLoaded: true,
        settingsRevision: state.settingsRevision + 1,
        themeRevision:
          normalizedSettings.theme === state.theme
            ? state.themeRevision
            : state.themeRevision + 1,
      }));
    },

    loadSettings: async () => {
      const startingRevision = get().settingsRevision;

      try {
        const result = await chrome.storage.local.get(
          EXTENSION_SETTINGS_STORAGE_KEY,
        );
        set((state) =>
          state.settingsRevision === startingRevision
            ? {
                ...normalizeSettings(result[EXTENSION_SETTINGS_STORAGE_KEY]),
                isLoaded: true,
              }
            : { isLoaded: true },
        );
      } catch (error) {
        logger.error('Failed to load extension settings', error);
        set({ isLoaded: true });
      }
    },

    setAutoFill: (autoFill) => {
      set((state) => ({
        autoFill,
        settingsRevision: state.settingsRevision + 1,
      }));
      persistSettings(currentPersistedSettings());
    },

    setAutoPost: (autoPost) => {
      set((state) => ({
        autoPost,
        settingsRevision: state.settingsRevision + 1,
      }));
      persistSettings(currentPersistedSettings());
    },

    setTheme: (theme) => {
      set((state) => ({
        settingsRevision: state.settingsRevision + 1,
        theme,
        themeRevision: state.themeRevision + 1,
      }));
      persistSettings(currentPersistedSettings());
    },
  }),
);
