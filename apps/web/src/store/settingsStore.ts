import { create } from 'zustand';
import { settingsApi } from '@/lib/api/settings';
import { logger } from '@/lib/logger';
import { ProviderTypeEnum } from '@genfeedai/types';
import type { EdgeStyle, ProviderType } from '@genfeedai/types';
import type { LLMProviderType, LLMProviderConfig } from '@/lib/ai/llm-providers';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '@/lib/ai/llm-providers';

// =============================================================================
// TYPES
// =============================================================================

export type { EdgeStyle, ProviderType };
export type { LLMProviderType, LLMProviderConfig };

export interface LLMSettings {
  providers: Record<LLMProviderType, LLMProviderConfig>;
  activeProvider: LLMProviderType;
  activeModel: string;
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

  // LLM BYOK Settings (for chat assistant)
  llm: LLMSettings;

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

  // LLM Actions
  setLLMProviderKey: (provider: LLMProviderType, key: string | null) => void;
  setLLMActiveProvider: (provider: LLMProviderType) => void;
  setLLMActiveModel: (model: string) => void;
  clearLLMProviderKey: (provider: LLMProviderType) => void;
  isLLMConfigured: () => boolean;
  getLLMApiKey: () => string | null;

  // Actions
  toggleAutoSave: () => void;
  setDebugMode: (enabled: boolean) => void;
  setProviderKey: (provider: ProviderType, key: string | null) => void;
  setProviderEnabled: (provider: ProviderType, enabled: boolean) => void;
  setDefaultModel: (type: 'image' | 'video', model: string, provider: ProviderType) => void;
  setEdgeStyle: (style: EdgeStyle) => Promise<void>;
  setShowMinimap: (show: boolean) => void;
  addRecentModel: (model: Omit<RecentModel, 'timestamp'>) => void;
  clearProviderKey: (provider: ProviderType) => void;
  clearAllKeys: () => void;
  setHasSeenWelcome: (seen: boolean) => void;

  // Computed
  isProviderConfigured: (provider: ProviderType) => boolean;
  getProviderHeader: (provider: ProviderType) => Record<string, string>;

  // API Sync
  isSyncing: boolean;
  syncFromServer: () => Promise<void>;
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
  llm: {
    activeModel: DEFAULT_LLM_MODEL,
    activeProvider: DEFAULT_LLM_PROVIDER as LLMProviderType,
    providers: {
      anthropic: { apiKey: null, defaultModel: 'claude-sonnet-4-6', enabled: false },
      openai: { apiKey: null, defaultModel: 'gpt-4.1-mini', enabled: false },
      replicate: { apiKey: null, defaultModel: 'meta/meta-llama-3.1-405b-instruct', enabled: true },
    },
  } as LLMSettings,
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
        llm: {
          ...DEFAULT_SETTINGS.llm,
          ...parsed.llm,
          providers: { ...DEFAULT_SETTINGS.llm.providers, ...parsed.llm?.providers },
        },
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
  llm: LLMSettings;
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
      llm: {
        activeModel: state.llm.activeModel,
        activeProvider: state.llm.activeProvider,
        providers: {
          anthropic: {
            apiKey: state.llm.providers.anthropic.apiKey,
            defaultModel: state.llm.providers.anthropic.defaultModel,
            enabled: state.llm.providers.anthropic.enabled,
          },
          openai: {
            apiKey: state.llm.providers.openai.apiKey,
            defaultModel: state.llm.providers.openai.defaultModel,
            enabled: state.llm.providers.openai.enabled,
          },
          replicate: {
            apiKey: state.llm.providers.replicate.apiKey,
            defaultModel: state.llm.providers.replicate.defaultModel,
            enabled: state.llm.providers.replicate.enabled,
          },
        },
      },
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
  const setAndPersist = (updater: (state: SettingsStore) => Partial<SettingsStore>) => {
    set((state) => {
      const newState = updater(state);
      saveToStorage({ ...state, ...newState } as Parameters<typeof saveToStorage>[0]);
      return newState;
    });
  };

  return {
    addRecentModel: (model) => {
      setAndPersist((state) => {
        // Remove existing entry for same model
        const filtered = state.recentModels.filter(
          (m) => !(m.id === model.id && m.provider === model.provider)
        );
        // Add to front with timestamp
        const newRecentModels = [{ ...model, timestamp: Date.now() }, ...filtered].slice(
          0,
          MAX_RECENT_MODELS
        );
        return { recentModels: newRecentModels };
      });
    },
    autoSaveEnabled: initialState.autoSaveEnabled,

    clearAllKeys: () => {
      setAndPersist((state) => ({
        llm: {
          ...state.llm,
          providers: {
            anthropic: { ...state.llm.providers.anthropic, apiKey: null, enabled: false },
            openai: { ...state.llm.providers.openai, apiKey: null, enabled: false },
            replicate: { ...state.llm.providers.replicate, apiKey: null },
          },
        },
        providers: {
          fal: { ...state.providers.fal, apiKey: null },
          'genfeed-ai': { ...state.providers['genfeed-ai'], apiKey: null },
          huggingface: { ...state.providers.huggingface, apiKey: null },
          replicate: { ...state.providers.replicate, apiKey: null },
        },
      }));
    },

    clearLLMProviderKey: (provider) => {
      setAndPersist((state) => ({
        llm: {
          ...state.llm,
          providers: {
            ...state.llm.providers,
            [provider]: { ...state.llm.providers[provider], apiKey: null, enabled: false },
          },
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

    getLLMApiKey: () => {
      const state = get();
      return state.llm.providers[state.llm.activeProvider].apiKey;
    },

    getProviderHeader: (provider) => {
      const state = get();
      const key = state.providers[provider]?.apiKey;
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

    isLLMConfigured: () => {
      const state = get();
      const activeProvider = state.llm.activeProvider;
      // Replicate can use server-side env var, others need BYOK
      if (activeProvider === 'replicate') return true;
      return !!state.llm.providers[activeProvider].apiKey;
    },

    isProviderConfigured: (provider) => {
      const state = get();
      return !!state.providers[provider].apiKey;
    },

    // API Sync
    isSyncing: false,
    llm: initialState.llm,
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

    setEdgeStyle: async (style) => {
      setAndPersist(() => ({ edgeStyle: style }));
      // Also update the current workflow's edges
      // Import dynamically to avoid circular dependency
      try {
        const { useWorkflowStore } = await import('@/store/workflowStore');
        useWorkflowStore.getState().setEdgeStyle(style);
      } catch (error) {
        logger.error('Failed to sync edge style to workflow store', error, {
          context: 'settingsStore',
          metadata: { style },
        });
        throw error;
      }
    },

    setHasSeenWelcome: (seen) => {
      setAndPersist(() => ({ hasSeenWelcome: seen }));
    },

    setLLMActiveModel: (model) => {
      setAndPersist((state) => ({
        llm: { ...state.llm, activeModel: model },
      }));
    },

    setLLMActiveProvider: (provider) => {
      setAndPersist((state) => ({
        llm: {
          ...state.llm,
          activeModel: state.llm.providers[provider].defaultModel,
          activeProvider: provider,
        },
      }));
    },

    setLLMProviderKey: (provider, key) => {
      setAndPersist((state) => ({
        llm: {
          ...state.llm,
          providers: {
            ...state.llm.providers,
            [provider]: {
              ...state.llm.providers[provider],
              apiKey: key,
              enabled: key ? true : state.llm.providers[provider].enabled,
            },
          },
        },
      }));
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

    syncFromServer: async () => {
      const { isSyncing } = get();
      if (isSyncing) return;

      set({ isSyncing: true });

      try {
        const serverSettings = await settingsApi.getAll();

        // Merge server settings with local (server wins for node defaults/UI prefs)
        set((state) => {
          const merged = {
            defaults: {
              ...state.defaults,
              imageModel: serverSettings.nodeDefaults.imageModel || state.defaults.imageModel,
              imageProvider:
                (serverSettings.nodeDefaults.imageProvider as ProviderType) ||
                state.defaults.imageProvider,
              videoModel: serverSettings.nodeDefaults.videoModel || state.defaults.videoModel,
              videoProvider:
                (serverSettings.nodeDefaults.videoProvider as ProviderType) ||
                state.defaults.videoProvider,
            },
            edgeStyle: (serverSettings.uiPreferences.edgeStyle as EdgeStyle) || state.edgeStyle,
            hasSeenWelcome: serverSettings.uiPreferences.hasSeenWelcome ?? state.hasSeenWelcome,
            recentModels: serverSettings.recentModels.map((m) => ({
              ...m,
              provider: m.provider as ProviderType,
              timestamp: m.timestamp || Date.now(),
            })),
            showMinimap: serverSettings.uiPreferences.showMinimap ?? state.showMinimap,
          };
          saveToStorage({ ...state, ...merged });
          return { ...merged, isSyncing: false };
        });
      } catch (error) {
        logger.error('Failed to sync settings from server', error, { context: 'SettingsStore' });
        set({ isSyncing: false });
      }
    },

    syncToServer: async () => {
      const state = get();
      if (state.isSyncing) return;

      set({ isSyncing: true });

      try {
        await settingsApi.update({
          nodeDefaults: {
            imageModel: state.defaults.imageModel,
            imageProvider: state.defaults.imageProvider,
            videoModel: state.defaults.videoModel,
            videoProvider: state.defaults.videoProvider,
          },
          uiPreferences: {
            edgeStyle: state.edgeStyle,
            hasSeenWelcome: state.hasSeenWelcome,
            showMinimap: state.showMinimap,
          },
        });

        set({ isSyncing: false });
      } catch (error) {
        logger.error('Failed to sync settings to server', error, { context: 'SettingsStore' });
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

// Re-export LLM providers for use in settings UI
export { LLM_PROVIDERS } from '@/lib/ai/llm-providers';
