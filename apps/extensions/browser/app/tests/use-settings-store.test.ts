import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '~store/use-settings-store';

describe('useSettingsStore theme preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      autoFill: false,
      autoPost: false,
      isLoaded: false,
      settingsRevision: 0,
      theme: 'system',
      themeRevision: 0,
    });
  });

  it('migrates legacy settings without a theme to system', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { autoFill: true, autoPost: false },
    });

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState()).toMatchObject({
      autoFill: true,
      autoPost: false,
      isLoaded: true,
      theme: 'system',
    });
  });

  it('falls back to usable defaults when storage cannot be read', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(
      useSettingsStore.getState().loadSettings(),
    ).resolves.toBeUndefined();

    expect(useSettingsStore.getState()).toMatchObject({
      autoFill: false,
      autoPost: false,
      isLoaded: true,
      theme: 'system',
    });
  });

  it('persists theme alongside the other preferences', () => {
    useSettingsStore.setState({ autoFill: true, autoPost: false });

    useSettingsStore.getState().setTheme('dark');

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      'genfeed-settings': {
        autoFill: true,
        autoPost: false,
        theme: 'dark',
      },
    });
  });

  it('advances the local revision when another extension context changes theme', () => {
    useSettingsStore.setState({ theme: 'dark', themeRevision: 4 });

    useSettingsStore.getState().applyStoredSettings({
      autoFill: false,
      autoPost: false,
      theme: 'light',
    });

    expect(useSettingsStore.getState()).toMatchObject({
      theme: 'light',
      themeRevision: 5,
    });
  });

  it('does not let a stale initial read overwrite a newer storage event', async () => {
    let resolveRead: ((settings: Record<string, unknown>) => void) | undefined;
    vi.mocked(chrome.storage.local.get).mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    const loadPromise = useSettingsStore.getState().loadSettings();
    useSettingsStore.getState().applyStoredSettings({ theme: 'light' });
    resolveRead?.({ 'genfeed-settings': { theme: 'dark' } });
    await loadPromise;

    expect(useSettingsStore.getState().theme).toBe('light');
  });
});
