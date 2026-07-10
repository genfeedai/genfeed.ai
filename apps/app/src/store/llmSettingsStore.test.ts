import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLLMSettingsStore } from './llmSettingsStore';

// jsdom here does not expose localStorage; provide a minimal in-memory mock so
// the store's persistence and migration paths are exercised.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
  writable: true,
});

const STORAGE_KEY = 'genfeed-llm-settings';
const LEGACY_KEY = 'genfeed-settings';

const INITIAL_STATE = useLLMSettingsStore.getState();

beforeEach(() => {
  localStorage.clear();
  useLLMSettingsStore.setState(INITIAL_STATE, true);
  useLLMSettingsStore.setState({
    llm: {
      activeModel: 'claude-sonnet-4-6',
      activeProvider: 'anthropic',
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
    },
  });
});

afterEach(() => {
  vi.resetModules();
});

describe('useLLMSettingsStore — BYOK keys', () => {
  it('sets a provider key, enables it, and persists', () => {
    useLLMSettingsStore.getState().setLLMProviderKey('anthropic', 'sk-ant-xyz');

    const { llm } = useLLMSettingsStore.getState();
    expect(llm.providers.anthropic.apiKey).toBe('sk-ant-xyz');
    expect(llm.providers.anthropic.enabled).toBe(true);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.providers.anthropic.apiKey).toBe('sk-ant-xyz');
  });

  it('clears a provider key and disables it', () => {
    useLLMSettingsStore.getState().setLLMProviderKey('openai', 'sk-xyz');
    useLLMSettingsStore.getState().clearLLMProviderKey('openai');

    const { llm } = useLLMSettingsStore.getState();
    expect(llm.providers.openai.apiKey).toBeNull();
    expect(llm.providers.openai.enabled).toBe(false);
  });

  it('switches active provider to its default model', () => {
    useLLMSettingsStore.getState().setLLMActiveProvider('openai');

    const { llm } = useLLMSettingsStore.getState();
    expect(llm.activeProvider).toBe('openai');
    expect(llm.activeModel).toBe('gpt-4.1-mini');
  });

  it('reports configuration state and resolves the active key', () => {
    // Replicate can use a server-side env var → always "configured".
    useLLMSettingsStore.getState().setLLMActiveProvider('replicate');
    expect(useLLMSettingsStore.getState().isLLMConfigured()).toBe(true);

    // Anthropic requires a BYOK key.
    useLLMSettingsStore.getState().setLLMActiveProvider('anthropic');
    expect(useLLMSettingsStore.getState().isLLMConfigured()).toBe(false);
    useLLMSettingsStore.getState().setLLMProviderKey('anthropic', 'sk-ant-1');
    expect(useLLMSettingsStore.getState().isLLMConfigured()).toBe(true);
    expect(useLLMSettingsStore.getState().getLLMApiKey()).toBe('sk-ant-1');
  });
});

describe('useLLMSettingsStore — persistence & migration', () => {
  it('hydrates from its own storage key', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeModel: 'gpt-4.1',
        activeProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'sk-persisted',
            defaultModel: 'gpt-4.1',
            enabled: true,
          },
        },
      }),
    );

    vi.resetModules();
    const { useLLMSettingsStore: fresh } = await import('./llmSettingsStore');

    const { llm } = fresh.getState();
    expect(llm.activeProvider).toBe('openai');
    expect(llm.providers.openai.apiKey).toBe('sk-persisted');
    // Defaults still fill in providers the persisted blob omitted.
    expect(llm.providers.anthropic).toBeDefined();
  });

  it('migrates BYOK keys from the legacy combined settings blob', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        edgeStyle: 'default',
        llm: {
          activeProvider: 'anthropic',
          providers: {
            anthropic: {
              apiKey: 'sk-legacy',
              defaultModel: 'claude-sonnet-4-6',
              enabled: true,
            },
          },
        },
      }),
    );

    vi.resetModules();
    const { useLLMSettingsStore: fresh } = await import('./llmSettingsStore');

    expect(fresh.getState().llm.providers.anthropic.apiKey).toBe('sk-legacy');
    // Eagerly persisted to the new key so a later package write to the legacy
    // `genfeed-settings` blob cannot strand the migrated keys.
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.providers.anthropic.apiKey).toBe('sk-legacy');
  });
});
