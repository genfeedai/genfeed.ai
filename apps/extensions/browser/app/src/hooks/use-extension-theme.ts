import { useEffect, useLayoutEffect } from 'react';

import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  useSettingsStore,
} from '~store/use-settings-store';
import { watchExtensionTheme } from '~theme/extension-theme';

export function useExtensionTheme(): boolean {
  const applyStoredSettings = useSettingsStore((s) => s.applyStoredSettings);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    if (!isLoaded) {
      void loadSettings();
    }
  }, [isLoaded, loadSettings]);

  useLayoutEffect(() => {
    if (!isLoaded) {
      return;
    }

    return watchExtensionTheme(theme);
  }, [isLoaded, theme]);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      const settingsChange = changes[EXTENSION_SETTINGS_STORAGE_KEY];
      if (settingsChange) {
        applyStoredSettings(settingsChange.newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [applyStoredSettings]);

  return isLoaded;
}
