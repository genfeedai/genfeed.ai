import { DEFAULT_THEME } from '@genfeedai/contracts/constants';
import type {
  PersistedExtensionSettings,
  SettingsActions,
  SettingsState,
} from '@genfeedai/contracts/interfaces/extension/extension-settings.interface';
import { create } from 'zustand';
import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  readStoredTheme,
} from '~theme/theme-storage';
import { logger } from '~utils/logger.util';

export { EXTENSION_SETTINGS_STORAGE_KEY } from '~theme/theme-storage';

function normalizeSettings(settings: unknown): PersistedExtensionSettings {
  const candidate =
    typeof settings === 'object' && settings !== null
      ? (settings as Record<string, unknown>)
      : {};

  return {
    recordOwnPublications:
      typeof candidate.recordOwnPublications === 'boolean'
        ? candidate.recordOwnPublications
        : true,
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
  const { autoFill, autoPost, theme, recordOwnPublications } =
    useSettingsStore.getState();
  return { autoFill, autoPost, theme, recordOwnPublications };
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set, get) => ({
    recordOwnPublications: true,
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

    setRecordOwnPublications: (recordOwnPublications) => {
      set((state) => ({
        recordOwnPublications,
        settingsRevision: state.settingsRevision + 1,
      }));
      persistSettings(currentPersistedSettings());
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
