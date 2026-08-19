import { act, render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useExtensionTheme } from '~hooks/use-extension-theme';
import { useSettingsStore } from '~store/use-settings-store';

function ThemeHarness(): ReactElement | null {
  const isThemeReady = useExtensionTheme();
  return isThemeReady ? <div>Theme ready</div> : null;
}

describe('useExtensionTheme', () => {
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
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { theme: 'system' },
    });
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('does not render or apply System before an explicit stored theme loads', async () => {
    let resolveSettings: (
      settings: Record<string, { theme: 'dark' }>,
    ) => void = () => undefined;
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    vi.mocked(chrome.storage.local.get).mockReturnValue(
      new Promise<Record<string, { theme: 'dark' }>>((resolve) => {
        resolveSettings = resolve;
      }),
    );

    render(<ThemeHarness />);

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.body).not.toHaveTextContent('Theme ready');

    act(() => {
      resolveSettings({ 'genfeed-settings': { theme: 'dark' } });
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.body).toHaveTextContent('Theme ready');
    });
  });

  it('loads persisted settings and synchronizes changes from another extension surface', async () => {
    let storageListener:
      | ((
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => void)
      | undefined;
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(
      (listener) => {
        storageListener = listener as typeof storageListener;
      },
    );

    render(<ThemeHarness />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    act(() => {
      storageListener?.(
        {
          'genfeed-settings': {
            newValue: { autoFill: false, autoPost: false, theme: 'dark' },
          },
        },
        'local',
      );
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it('returns to System when extension settings are removed', async () => {
    let storageListener:
      | ((
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => void)
      | undefined;
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      'genfeed-settings': { theme: 'dark' },
    });
    vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(
      (listener) => {
        storageListener = listener as typeof storageListener;
      },
    );

    render(<ThemeHarness />);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    act(() => {
      storageListener?.(
        { 'genfeed-settings': { oldValue: { theme: 'dark' } } },
        'local',
      );
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
  });
});
