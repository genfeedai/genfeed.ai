import { create } from 'zustand';
import type {
  LLMProviderConfig,
  LLMProviderType,
} from '@/lib/ai/llm-providers';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
} from '@/lib/ai/llm-providers';

// =============================================================================
// TYPES
// =============================================================================

export type { LLMProviderType };

export interface LLMSettings {
  providers: Record<LLMProviderType, LLMProviderConfig>;
  activeProvider: LLMProviderType;
  activeModel: string;
}

interface LLMSettingsStore {
  llm: LLMSettings;

  setLLMProviderKey: (provider: LLMProviderType, key: string | null) => void;
  setLLMActiveProvider: (provider: LLMProviderType) => void;
  setLLMActiveModel: (model: string) => void;
  clearLLMProviderKey: (provider: LLMProviderType) => void;
  isLLMConfigured: () => boolean;
  getLLMApiKey: () => string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'genfeed-llm-settings';
/**
 * Legacy key the LLM slice used to share with the shared workflow settings.
 * Read once on init so existing users keep their BYOK keys after the split
 * (#1536 §2.I — settings store shadow removed; LLM stays app-owned).
 */
const LEGACY_SETTINGS_KEY = 'genfeed-settings';

const DEFAULT_LLM_SETTINGS: LLMSettings = {
  activeModel: DEFAULT_LLM_MODEL,
  activeProvider: DEFAULT_LLM_PROVIDER,
  providers: {
    anthropic: {
      apiKey: null,
      defaultModel: 'claude-sonnet-4-6',
      enabled: false,
    },
    openai: { apiKey: null, defaultModel: 'gpt-4.1-mini', enabled: false },
    replicate: {
      apiKey: null,
      defaultModel: 'meta/meta-llama-3.1-405b-instruct',
      enabled: true,
    },
  },
};

// =============================================================================
// PERSISTENCE
// =============================================================================

function mergeLLM(parsed: Partial<LLMSettings> | undefined): LLMSettings {
  if (!parsed) return DEFAULT_LLM_SETTINGS;
  return {
    ...DEFAULT_LLM_SETTINGS,
    ...parsed,
    providers: {
      ...DEFAULT_LLM_SETTINGS.providers,
      ...parsed.providers,
    },
  };
}

function loadFromStorage(): LLMSettings {
  if (typeof window === 'undefined') return DEFAULT_LLM_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return mergeLLM(JSON.parse(stored) as Partial<LLMSettings>);
    }

    // One-time migration from the legacy combined settings blob.
    const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { llm?: Partial<LLMSettings> };
      if (parsed.llm) return mergeLLM(parsed.llm);
    }
  } catch {
    // Invalid JSON or storage error — fall back to defaults.
  }
  return DEFAULT_LLM_SETTINGS;
}

function saveToStorage(llm: LLMSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(llm));
  } catch {
    // Storage error (quota exceeded, private mode, etc.)
  }
}

// =============================================================================
// STORE
// =============================================================================

/**
 * App-owned BYOK store for the conversational workflow assistant's LLM keys.
 *
 * Split out of the workflow-ui settings shadow: shared canvas settings now live
 * in `@genfeedai/workflow-ui/stores`, while LLM BYOK stays app-local because it
 * is not a package concern. Persisted under its own key so it never collides
 * with the package store's `genfeed-settings` blob.
 */
export const useLLMSettingsStore = create<LLMSettingsStore>((set, get) => {
  const initialLLM = loadFromStorage();

  const setAndPersist = (next: LLMSettings) => {
    saveToStorage(next);
    set({ llm: next });
  };

  return {
    clearLLMProviderKey: (provider) => {
      const { llm } = get();
      setAndPersist({
        ...llm,
        providers: {
          ...llm.providers,
          [provider]: {
            ...llm.providers[provider],
            apiKey: null,
            enabled: false,
          },
        },
      });
    },

    getLLMApiKey: () => {
      const { llm } = get();
      return llm.providers[llm.activeProvider].apiKey;
    },

    isLLMConfigured: () => {
      const { llm } = get();
      // Replicate can use a server-side env var; others require BYOK.
      if (llm.activeProvider === 'replicate') return true;
      return !!llm.providers[llm.activeProvider].apiKey;
    },

    llm: initialLLM,

    setLLMActiveModel: (model) => {
      const { llm } = get();
      setAndPersist({ ...llm, activeModel: model });
    },

    setLLMActiveProvider: (provider) => {
      const { llm } = get();
      setAndPersist({
        ...llm,
        activeModel: llm.providers[provider].defaultModel,
        activeProvider: provider,
      });
    },

    setLLMProviderKey: (provider, key) => {
      const { llm } = get();
      setAndPersist({
        ...llm,
        providers: {
          ...llm.providers,
          [provider]: {
            ...llm.providers[provider],
            apiKey: key,
            enabled: key ? true : llm.providers[provider].enabled,
          },
        },
      });
    },
  };
});
