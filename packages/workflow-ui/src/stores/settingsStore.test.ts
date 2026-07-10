import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSyncService } from '../provider/types';
import { configureSettingsSync, useSettingsStore } from './settingsStore';

// jsdom here does not expose localStorage; the store guards writes in try/catch,
// but these tests assert persistence, so provide a minimal in-memory mock.
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

const INITIAL_STATE = useSettingsStore.getState();

beforeEach(() => {
  useSettingsStore.setState(INITIAL_STATE, true);
  useSettingsStore.setState({
    defaults: {
      imageModel: 'local-image',
      imageProvider: 'replicate',
      videoModel: 'local-video',
      videoProvider: 'replicate',
    },
    edgeStyle: 'default',
    hasSeenWelcome: false,
    isSyncing: false,
    recentModels: [],
    showMinimap: true,
  });
  configureSettingsSync(undefined);
  localStorage.clear();
});

describe('settingsStore — sync not configured', () => {
  it('syncFromServer is a no-op when no adapter is injected', async () => {
    await useSettingsStore.getState().syncFromServer();
    const state = useSettingsStore.getState();
    expect(state.isSyncing).toBe(false);
    expect(state.edgeStyle).toBe('default');
  });

  it('syncToServer is a no-op when no adapter is injected', async () => {
    await expect(
      useSettingsStore.getState().syncToServer(),
    ).resolves.toBeUndefined();
  });
});

describe('settingsStore — syncFromServer', () => {
  it('merges server values, keeping local for omitted fields', async () => {
    const service: SettingsSyncService = {
      pull: vi.fn().mockResolvedValue({
        defaults: { imageModel: 'server-image' },
        edgeStyle: 'straight',
        recentModels: [
          {
            displayName: 'FLUX',
            id: 'flux',
            provider: 'replicate',
            timestamp: 1,
          },
        ],
      }),
      push: vi.fn(),
    };
    configureSettingsSync(service);

    await useSettingsStore.getState().syncFromServer();

    const state = useSettingsStore.getState();
    // Server wins where present…
    expect(state.edgeStyle).toBe('straight');
    expect(state.defaults.imageModel).toBe('server-image');
    expect(state.recentModels).toHaveLength(1);
    // …local kept where the server omitted the field.
    expect(state.defaults.videoModel).toBe('local-video');
    expect(state.showMinimap).toBe(true);
    expect(state.isSyncing).toBe(false);
    // Merged result is persisted.
    expect(localStorage.getItem('genfeed-settings')).toContain('server-image');
  });

  it('resets isSyncing and preserves state when pull rejects', async () => {
    const service: SettingsSyncService = {
      pull: vi.fn().mockRejectedValue(new Error('network')),
      push: vi.fn(),
    };
    configureSettingsSync(service);

    await useSettingsStore.getState().syncFromServer();

    const state = useSettingsStore.getState();
    expect(state.isSyncing).toBe(false);
    expect(state.edgeStyle).toBe('default');
  });

  it('skips a concurrent pull while a sync is in flight', async () => {
    const service: SettingsSyncService = {
      pull: vi.fn().mockResolvedValue({}),
      push: vi.fn(),
    };
    configureSettingsSync(service);
    useSettingsStore.setState({ isSyncing: true });

    await useSettingsStore.getState().syncFromServer();

    expect(service.pull).not.toHaveBeenCalled();
  });
});

describe('settingsStore — syncToServer', () => {
  it('pushes the current syncable fields', async () => {
    const service: SettingsSyncService = {
      pull: vi.fn(),
      push: vi.fn().mockResolvedValue(undefined),
    };
    configureSettingsSync(service);
    useSettingsStore.setState({ edgeStyle: 'smoothstep', showMinimap: false });

    await useSettingsStore.getState().syncToServer();

    expect(service.push).toHaveBeenCalledWith(
      expect.objectContaining({ edgeStyle: 'smoothstep', showMinimap: false }),
    );
    expect(useSettingsStore.getState().isSyncing).toBe(false);
  });

  it('resets isSyncing when push rejects', async () => {
    const service: SettingsSyncService = {
      pull: vi.fn(),
      push: vi.fn().mockRejectedValue(new Error('network')),
    };
    configureSettingsSync(service);

    await useSettingsStore.getState().syncToServer();

    expect(useSettingsStore.getState().isSyncing).toBe(false);
  });
});
