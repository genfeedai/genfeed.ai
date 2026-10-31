import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '~store/use-settings-store';

describe('useSettingsStore theme preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      recordOwnPublications: true,
      autoFill: false,
      autoPost: false,
      isLoaded: false,
      localFallbackProviderId: null,
      settingsRevision: 0,
      theme: 'system',
      themeRevision: 0,
    });
  });

  it('defaults stored settings without a theme to system', async () => {
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
        localFallbackProviderId: null,
        theme: 'dark',
        recordOwnPublications: true,
      },
    });
  });

  it('keeps cloud only until a fallback provider is chosen', () => {
    expect(useSettingsStore.getState().localFallbackProviderId).toBeNull();
    useSettingsStore.getState().applyStoredSettings({ autoFill: true });
    expect(useSettingsStore.getState().localFallbackProviderId).toBeNull();
  });

  it('persists the chosen fallback provider and reads it back', () => {
    useSettingsStore.getState().setLocalFallbackProvider('claude-cli');

    expect(useSettingsStore.getState().localFallbackProviderId).toBe(
      'claude-cli',
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      'genfeed-settings': expect.objectContaining({
        localFallbackProviderId: 'claude-cli',
      }),
    });

    useSettingsStore.getState().setLocalFallbackProvider(null);
    useSettingsStore
      .getState()
      .applyStoredSettings({ localFallbackProviderId: 'codex-cli' });
    expect(useSettingsStore.getState().localFallbackProviderId).toBe(
      'codex-cli',
    );
  });

  it('ignores a stored provider the protocol does not know', () => {
    useSettingsStore
      .getState()
      .applyStoredSettings({ localFallbackProviderId: 'rm-rf' });
    expect(useSettingsStore.getState().localFallbackProviderId).toBeNull();
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

it('defaults recording on while preserving explicitfalse and unrelated writes', async () => {
  const store = useSettingsStore.getState();
  store.applyStoredSettings({ recordOwnPublications: false });
  store.setAutoFill(true);
  store.setAutoPost(false);
  store.setTheme('light');
  store.applyAccountTheme('dark');
  expect(useSettingsStore.getState().recordOwnPublications).toBe(false);
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
    'genfeed-settings': expect.objectContaining({
      recordOwnPublications: false,
    }),
  });
  store.applyStoredSettings({ recordOwnPublications: 'invalid' });
  expect(useSettingsStore.getState().recordOwnPublications).toBe(true);
});
it('late storage hydration cannot overwrite a newer recording preference', async () => {
  let finish!: (value: Record<string, unknown>) => void;
  vi.mocked(chrome.storage.local.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = useSettingsStore.getState().loadSettings();
  useSettingsStore.getState().setRecordOwnPublications(false);
  finish({ 'genfeed-settings': { recordOwnPublications: true } });
  await pending;
  expect(useSettingsStore.getState().recordOwnPublications).toBe(false);
});
