import { ProviderTypeEnum } from '@genfeedai/contracts/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureEdgeStyleMirror } from './edgeStyleMirror';
import { configureSettingsSync, useSettingsStore } from './settingsStore';

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

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem('genfeed-settings');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

beforeEach(() => {
  configureEdgeStyleMirror(undefined);
  configureSettingsSync(undefined);
  localStorage.clear();
  useSettingsStore.setState({
    autoSaveEnabled: true,
    debugMode: false,
    defaults: {
      imageModel: 'nano-banana-pro',
      imageProvider: 'replicate',
      videoModel: 'veo-3.1',
      videoProvider: 'replicate',
    },
    edgeStyle: 'default',
    hasSeenWelcome: false,
    isSyncing: false,
    providers: {
      fal: { apiKey: null, enabled: false },
      'genfeed-ai': { apiKey: null, enabled: true },
      openrouter: { apiKey: null, enabled: false },
      replicate: { apiKey: null, enabled: true },
    },
    recentModels: [],
    showMinimap: true,
  });
});

describe('settingsStore — provider keys', () => {
  it('setProviderKey stores the key and force-enables the provider', () => {
    useSettingsStore
      .getState()
      .setProviderKey(ProviderTypeEnum.FAL, 'fal-key-123');

    const fal = useSettingsStore.getState().providers.fal;
    expect(fal.apiKey).toBe('fal-key-123');
    expect(fal.enabled).toBe(true);
  });

  it('never persists API keys to storage', () => {
    useSettingsStore
      .getState()
      .setProviderKey(ProviderTypeEnum.REPLICATE, 'secret');

    const persisted = readPersisted() as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(persisted.providers.replicate).toEqual({ enabled: true });
    expect(JSON.stringify(persisted)).not.toContain('secret');
  });

  it('clearProviderKey removes only that key', () => {
    useSettingsStore.getState().setProviderKey(ProviderTypeEnum.REPLICATE, 'a');
    useSettingsStore.getState().setProviderKey(ProviderTypeEnum.FAL, 'b');

    useSettingsStore.getState().clearProviderKey(ProviderTypeEnum.REPLICATE);

    expect(useSettingsStore.getState().providers.replicate.apiKey).toBeNull();
    expect(useSettingsStore.getState().providers.fal.apiKey).toBe('b');
  });

  it('clearAllKeys wipes every key but keeps enabled flags', () => {
    useSettingsStore.getState().setProviderKey(ProviderTypeEnum.REPLICATE, 'a');
    useSettingsStore.getState().setProviderKey(ProviderTypeEnum.FAL, 'b');

    useSettingsStore.getState().clearAllKeys();

    const providers = useSettingsStore.getState().providers;
    expect(providers.replicate.apiKey).toBeNull();
    expect(providers.fal.apiKey).toBeNull();
    expect(providers.fal.enabled).toBe(true);
  });

  it('setProviderEnabled toggles without touching the key', () => {
    useSettingsStore
      .getState()
      .setProviderKey(ProviderTypeEnum.OPENROUTER, 'key');
    useSettingsStore
      .getState()
      .setProviderEnabled(ProviderTypeEnum.OPENROUTER, false);

    const openrouter = useSettingsStore.getState().providers.openrouter;
    expect(openrouter.enabled).toBe(false);
    expect(openrouter.apiKey).toBe('key');
  });

  it('isProviderConfigured reflects key presence', () => {
    expect(
      useSettingsStore
        .getState()
        .isProviderConfigured(ProviderTypeEnum.REPLICATE),
    ).toBe(false);

    useSettingsStore.getState().setProviderKey(ProviderTypeEnum.REPLICATE, 'x');
    expect(
      useSettingsStore
        .getState()
        .isProviderConfigured(ProviderTypeEnum.REPLICATE),
    ).toBe(true);
  });

  it('getProviderHeader maps each provider to its BYOK header', () => {
    const store = useSettingsStore.getState();
    expect(store.getProviderHeader(ProviderTypeEnum.REPLICATE)).toEqual({});

    store.setProviderKey(ProviderTypeEnum.REPLICATE, 'r');
    store.setProviderKey(ProviderTypeEnum.FAL, 'f');
    store.setProviderKey(ProviderTypeEnum.OPENROUTER, 'o');
    store.setProviderKey(ProviderTypeEnum.GENFEED_AI, 'g');

    const current = useSettingsStore.getState();
    expect(current.getProviderHeader(ProviderTypeEnum.REPLICATE)).toEqual({
      'X-Replicate-Key': 'r',
    });
    expect(current.getProviderHeader(ProviderTypeEnum.FAL)).toEqual({
      'X-Fal-Key': 'f',
    });
    expect(current.getProviderHeader(ProviderTypeEnum.OPENROUTER)).toEqual({
      'X-OpenRouter-Key': 'o',
    });
    expect(current.getProviderHeader(ProviderTypeEnum.GENFEED_AI)).toEqual({
      'X-Genfeed-Key': 'g',
    });
  });
});

describe('settingsStore — preferences', () => {
  it('setDefaultModel updates image and video defaults independently', () => {
    useSettingsStore
      .getState()
      .setDefaultModel('image', 'img-x', ProviderTypeEnum.FAL);
    useSettingsStore
      .getState()
      .setDefaultModel('video', 'vid-y', ProviderTypeEnum.OPENROUTER);

    const defaults = useSettingsStore.getState().defaults;
    expect(defaults.imageModel).toBe('img-x');
    expect(defaults.imageProvider).toBe('fal');
    expect(defaults.videoModel).toBe('vid-y');
    expect(defaults.videoProvider).toBe('openrouter');
  });

  it('toggleAutoSave flips and persists', () => {
    useSettingsStore.getState().toggleAutoSave();
    expect(useSettingsStore.getState().autoSaveEnabled).toBe(false);
    expect(readPersisted().autoSaveEnabled).toBe(false);
  });

  it('setDebugMode, setShowMinimap and setHasSeenWelcome persist', () => {
    useSettingsStore.getState().setDebugMode(true);
    useSettingsStore.getState().setShowMinimap(false);
    useSettingsStore.getState().setHasSeenWelcome(true);

    const state = useSettingsStore.getState();
    expect(state.debugMode).toBe(true);
    expect(state.showMinimap).toBe(false);
    expect(state.hasSeenWelcome).toBe(true);

    const persisted = readPersisted();
    expect(persisted.debugMode).toBe(true);
    expect(persisted.showMinimap).toBe(false);
    expect(persisted.hasSeenWelcome).toBe(true);
  });

  it('setEdgeStyle persists and mirrors to the canvas synchronously', () => {
    const mirrored: string[] = [];
    configureEdgeStyleMirror((style) => {
      mirrored.push(style);
    });

    useSettingsStore.getState().setEdgeStyle('straight');

    // Synchronous on purpose: a deferred mirror (the old dynamic import) can
    // resolve after the test environment is torn down and surface as an
    // unhandled rejection.
    expect(mirrored).toEqual(['straight']);
    expect(useSettingsStore.getState().edgeStyle).toBe('straight');
    expect(readPersisted().edgeStyle).toBe('straight');
  });

  it('setEdgeStyle still persists when no canvas mirror is registered', () => {
    configureEdgeStyleMirror(undefined);

    expect(() =>
      useSettingsStore.getState().setEdgeStyle('step'),
    ).not.toThrow();
    expect(readPersisted().edgeStyle).toBe('step');
  });

  it('preserves host-owned extensions in the storage key', () => {
    localStorage.setItem(
      'genfeed-settings',
      JSON.stringify({ hostOnlyField: 'keep-me' }),
    );

    useSettingsStore.getState().setDebugMode(true);

    expect(readPersisted().hostOnlyField).toBe('keep-me');
  });
});

describe('settingsStore — recent models', () => {
  it('addRecentModel prepends with a timestamp', () => {
    useSettingsStore.getState().addRecentModel({
      displayName: 'Model A',
      id: 'a',
      provider: ProviderTypeEnum.REPLICATE,
    });
    useSettingsStore.getState().addRecentModel({
      displayName: 'Model B',
      id: 'b',
      provider: ProviderTypeEnum.REPLICATE,
    });

    const recents = useSettingsStore.getState().recentModels;
    expect(recents.map((m) => m.id)).toEqual(['b', 'a']);
    expect(recents[0].timestamp).toBeGreaterThan(0);
  });

  it('re-adding a model moves it to the front without duplicating', () => {
    const store = useSettingsStore.getState();
    store.addRecentModel({
      displayName: 'A',
      id: 'a',
      provider: ProviderTypeEnum.REPLICATE,
    });
    store.addRecentModel({
      displayName: 'B',
      id: 'b',
      provider: ProviderTypeEnum.REPLICATE,
    });
    store.addRecentModel({
      displayName: 'A',
      id: 'a',
      provider: ProviderTypeEnum.REPLICATE,
    });

    expect(useSettingsStore.getState().recentModels.map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('caps the recent list at 8 entries', () => {
    for (let i = 0; i < 12; i++) {
      useSettingsStore.getState().addRecentModel({
        displayName: `M${i}`,
        id: `m-${i}`,
        provider: ProviderTypeEnum.REPLICATE,
      });
    }

    const recents = useSettingsStore.getState().recentModels;
    expect(recents).toHaveLength(8);
    expect(recents[0].id).toBe('m-11');
  });
});
