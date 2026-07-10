import type { EdgeStyle, ProviderType } from '@genfeedai/types';
import { ProviderTypeEnum } from '@genfeedai/types';
import { create } from 'zustand';
import type { SettingsSyncService } from '../provider/types';
import { getWorkflowLogger } from './executionLogger';

// =============================================================================
// TYPES
// =============================================================================

export type { EdgeStyle, ProviderType };

// =============================================================================
// Module-level settings-sync configuration
// =============================================================================

let _settingsSync: SettingsSyncService | null = null;

/**
 * Configure the settings store with a server-sync adapter.
 * Called by WorkflowUIProvider when a `settingsSync` service is provided.
 *
 * The store lives outside the React tree (plain Zustand) and cannot read the
 * provider context directly, so the adapter is registered at module scope —
 * the same pattern the prompt library and execution logger use. When unset,
 * `syncFromServer`/`syncToServer` are no-ops and settings stay device-local.
 */
export function configureSettingsSync(
  service: SettingsSyncService | undefined,
): void {
  _settingsSync = service ?? null;
}

export interface ProviderConfig {
  apiKey: string | null;
  enabled: boolean;
}

export interface ProviderSettings {
  replicate: ProviderConfig;
  fal: ProviderConfig;
  huggingface: ProviderConfig;
  'genfeed-ai': ProviderConfig;
}

export interface DefaultModelSettings {
  imageModel: string;
  imageProvider: ProviderType;
  videoModel: string;
  videoProvider: ProviderType;
}

export interface RecentModel {
  id: string;
  displayName: string;
  provider: ProviderType;
  timestamp: number;
}

interface SettingsStore {
  // Provider API Keys
  providers: ProviderSettings;

  // Default Models
  defaults: DefaultModelSettings;

  // UI Preferences
  edgeStyle: EdgeStyle;
  showMinimap: boolean;
  autoSaveEnabled: boolean;

  // Recent models (for model browser)
  recentModels: RecentModel[];

  // Onboarding
  hasSeenWelcome: boolean;

  // Developer
  debugMode: boolean;

  // Actions
  toggleAutoSave: () => void;
  setDebugMode: (enabled: boolean) => void;
  setProviderKey: (provider: ProviderType, key: string | null) => void;
  setProviderEnabled: (provider: ProviderType, enabled: boolean) => void;
  setDefaultModel: (
    type: 'image' | 'video',
    model: string,
    provider: ProviderType,
  ) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  setShowMinimap: (show: boolean) => void;
  addRecentModel: (model: Omit<RecentModel, 'timestamp'>) => void;
  clearProviderKey: (provider: ProviderType) => void;
  clearAllKeys: () => void;
  setHasSeenWelcome: (seen: boolean) => void;

  // Computed
  isProviderConfigured: (provider: ProviderType) => boolean;
  getProviderHeader: (provider: ProviderType) => Record<string, string>;

  // API Sync — delegate to the injected settingsSync adapter (no-op if unset)
  isSyncing: boolean;
  syncFromServer: (signal?: AbortSignal) => Promise<void>;
  syncToServer: () => Promise<void>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'genfeed-settings';
const MAX_RECENT_MODELS = 8;

const DEFAULT_SETTINGS = {
  autoSaveEnabled: true,
  debugMode: false,
  defaults: {
    imageModel: 'nano-banana-pro',
    imageProvider: 'replicate' as ProviderType,
    videoModel: 'veo-3.1',
    videoProvider: 'replicate' as ProviderType,
  },
  edgeStyle: 'default' as EdgeStyle,
  hasSeenWelcome: false,
  providers: {
    fal: { apiKey: null, enabled: false },
    'genfeed-ai': { apiKey: null, enabled: true },
    huggingface: { apiKey: null, enabled: false },
    replicate: { apiKey: null, enabled: true },
  },
  recentModels: [] as RecentModel[],
  showMinimap: true,
};

// =============================================================================
// PERSISTENCE
// =============================================================================

function loadFromStorage(): Partial<typeof DEFAULT_SETTINGS> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        autoSaveEnabled: parsed.autoSaveEnabled ?? true,
        debugMode: parsed.debugMode ?? false,
        defaults: { ...DEFAULT_SETTINGS.defaults, ...parsed.defaults },
        edgeStyle:
          parsed.edgeStyle === 'bezier'
            ? 'default'
            : (parsed.edgeStyle ?? DEFAULT_SETTINGS.edgeStyle),
        hasSeenWelcome: parsed.hasSeenWelcome ?? false,
        providers: { ...DEFAULT_SETTINGS.providers, ...parsed.providers },
        recentModels: parsed.recentModels ?? [],
        showMinimap: parsed.showMinimap ?? DEFAULT_SETTINGS.showMinimap,
      };
    }
  } catch {
    // Invalid JSON or storage error
  }
  return {};
}

function saveToStorage(state: {
  providers: ProviderSettings;
  defaults: DefaultModelSettings;
  edgeStyle: EdgeStyle;
  showMinimap: boolean;
  autoSaveEnabled: boolean;
  recentModels: RecentModel[];
  hasSeenWelcome: boolean;
  debugMode: boolean;
}) {
  if (typeof window === 'undefined') return;

  try {
    // Don't persist API keys in plain text - only enabled status and non-sensitive settings
    const toSave = {
      autoSaveEnabled: state.autoSaveEnabled,
      debugMode: state.debugMode,
      defaults: state.defaults,
      edgeStyle: state.edgeStyle,
      hasSeenWelcome: state.hasSeenWelcome,
      providers: {
        fal: {
          apiKey: state.providers.fal.apiKey,
          enabled: state.providers.fal.enabled,
        },
        huggingface: {
          apiKey: state.providers.huggingface.apiKey,
          enabled: state.providers.huggingface.enabled,
        },
        replicate: {
          apiKey: state.providers.replicate.apiKey,
          enabled: state.providers.replicate.enabled,
        },
      },
      recentModels: state.recentModels.slice(0, MAX_RECENT_MODELS),
      showMinimap: state.showMinimap,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage error (quota exceeded, etc.)
  }
}

// =============================================================================
// STORE
// =============================================================================

const initialState = { ...DEFAULT_SETTINGS, ...loadFromStorage() };

export const useSettingsStore = create<SettingsStore>((set, get) => {
  // Helper to set state and persist in one call
  const setAndPersist = (
    updater: (state: SettingsStore) => Partial<SettingsStore>,
  ) => {
    set((state) => {
      const newState = updater(state);
      saveToStorage({ ...state, ...newState } as Parameters<
        typeof saveToStorage
      >[0]);
      return newState;
    });
  };

  return {
    addRecentModel: (model) => {
      setAndPersist((state) => {
        // Remove existing entry for same model
        const filtered = state.recentModels.filter(
          (m) => !(m.id === model.id && m.provider === model.provider),
        );
        // Add to front with timestamp
        const newRecentModels = [
          { ...model, timestamp: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT_MODELS);
        return { recentModels: newRecentModels };
      });
    },
    autoSaveEnabled: initialState.autoSaveEnabled,

    clearAllKeys: () => {
      setAndPersist((state) => ({
        providers: {
          fal: { ...state.providers.fal, apiKey: null },
          'genfeed-ai': { ...state.providers['genfeed-ai'], apiKey: null },
          huggingface: { ...state.providers.huggingface, apiKey: null },
          replicate: { ...state.providers.replicate, apiKey: null },
        },
      }));
    },

    clearProviderKey: (provider) => {
      setAndPersist((state) => ({
        providers: {
          ...state.providers,
          [provider]: {
            ...state.providers[provider],
            apiKey: null,
          },
        },
      }));
    },
    debugMode: initialState.debugMode,
    defaults: initialState.defaults,
    edgeStyle: initialState.edgeStyle,

    getProviderHeader: (provider) => {
      const state = get();
      const key = state.providers[provider].apiKey;
      if (!key) return {};

      const headerMap: Record<ProviderType, string> = {
        [ProviderTypeEnum.REPLICATE]: 'X-Replicate-Key',
        [ProviderTypeEnum.FAL]: 'X-Fal-Key',
        [ProviderTypeEnum.HUGGINGFACE]: 'X-HF-Key',
        [ProviderTypeEnum.GENFEED_AI]: 'X-Genfeed-Key',
      };

      return { [headerMap[provider]]: key };
    },
    hasSeenWelcome: initialState.hasSeenWelcome,

    isProviderConfigured: (provider) => {
      const state = get();
      return !!state.providers[provider].apiKey;
    },

    // API Sync - stubbed as no-ops (consuming app provides real implementations)
    isSyncing: false,
    providers: initialState.providers,
    recentModels: initialState.recentModels,

    setDebugMode: (enabled) => {
      setAndPersist(() => ({ debugMode: enabled }));
    },

    setDefaultModel: (type, model, provider) => {
      setAndPersist((state) => ({
        defaults: {
          ...state.defaults,
          ...(type === 'image'
            ? { imageModel: model, imageProvider: provider }
            : { videoModel: model, videoProvider: provider }),
        },
      }));
    },

    setEdgeStyle: (style) => {
      setAndPersist(() => ({ edgeStyle: style }));
      // Dynamic import to avoid circular dependency
      import('./workflow').then(({ useWorkflowStore }) => {
        useWorkflowStore.getState().setEdgeStyle(style);
      });
    },

    setHasSeenWelcome: (seen) => {
      setAndPersist(() => ({ hasSeenWelcome: seen }));
    },

    setProviderEnabled: (provider, enabled) => {
      setAndPersist((state) => ({
        providers: {
          ...state.providers,
          [provider]: {
            ...state.providers[provider],
            enabled,
          },
        },
      }));
    },

    setProviderKey: (provider, key) => {
      setAndPersist((state) => ({
        providers: {
          ...state.providers,
          [provider]: {
            ...state.providers[provider],
            apiKey: key,
            enabled: key ? true : state.providers[provider].enabled,
          },
        },
      }));
    },

    setShowMinimap: (show) => {
      setAndPersist(() => ({ showMinimap: show }));
    },
    showMinimap: initialState.showMinimap,

    // Delegates to the injected settingsSync adapter (module-scope). No-op when
    // unset so the package stays device-local standalone. The merge lives here
    // because the store owns the current state; the adapter only maps DTOs.
    syncFromServer: async (signal) => {
      if (!_settingsSync) return;
      if (get().isSyncing) return;

      set({ isSyncing: true });

      try {
        const server = await _settingsSync.pull(signal);

        // Server wins for provided fields; omitted (undefined) fields keep the
        // local value so a never-synced preference never clobbers a local one.
        set((state) => {
          const merged = {
            defaults: { ...state.defaults, ...server.defaults },
            edgeStyle: server.edgeStyle ?? state.edgeStyle,
            hasSeenWelcome: server.hasSeenWelcome ?? state.hasSeenWelcome,
            recentModels: server.recentModels ?? state.recentModels,
            showMinimap: server.showMinimap ?? state.showMinimap,
          };
          saveToStorage({ ...state, ...merged });
          return { ...merged, isSyncing: false };
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          getWorkflowLogger().error('Failed to sync settings from server', {
            context: 'settingsStore',
            error,
          });
        }
        set({ isSyncing: false });
      }
    },

    syncToServer: async () => {
      if (!_settingsSync) return;
      const state = get();
      if (state.isSyncing) return;

      set({ isSyncing: true });

      try {
        await _settingsSync.push({
          defaults: state.defaults,
          edgeStyle: state.edgeStyle,
          hasSeenWelcome: state.hasSeenWelcome,
          recentModels: state.recentModels,
          showMinimap: state.showMinimap,
        });
        set({ isSyncing: false });
      } catch (error) {
        getWorkflowLogger().error('Failed to sync settings to server', {
          context: 'settingsStore',
          error,
        });
        set({ isSyncing: false });
      }
    },

    toggleAutoSave: () => {
      setAndPersist((state) => ({ autoSaveEnabled: !state.autoSaveEnabled }));
    },
  };
});

// =============================================================================
// PROVIDER DISPLAY INFO
// =============================================================================

export const PROVIDER_INFO: Record<
  ProviderType,
  { name: string; description: string; docsUrl: string }
> = {
  [ProviderTypeEnum.REPLICATE]: {
    description: 'Access thousands of open-source AI models',
    docsUrl: 'https://replicate.com/docs',
    name: 'Replicate',
  },
  [ProviderTypeEnum.FAL]: {
    description: 'Fast inference for image and video generation',
    docsUrl: 'https://fal.ai/docs',
    name: 'fal.ai',
  },
  [ProviderTypeEnum.HUGGINGFACE]: {
    description: 'The AI community platform with 500k+ models',
    docsUrl: 'https://huggingface.co/docs/api-inference',
    name: 'Hugging Face',
  },
  [ProviderTypeEnum.GENFEED_AI]: {
    description: 'Built-in models powered by Genfeed',
    docsUrl: 'https://genfeed.ai/docs',
    name: 'Genfeed AI',
  },
};
