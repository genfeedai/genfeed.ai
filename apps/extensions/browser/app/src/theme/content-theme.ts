import {
  DEFAULT_THEME,
  resolveThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  readStoredTheme,
} from '~theme/theme-storage';
import { logger } from '~utils/logger.util';

const CONTENT_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const CONTENT_THEME_SELECTOR = '.genfeed-dropdown';

let currentPreference: ThemePreference = DEFAULT_THEME;
let systemPrefersDark = false;

function resolvedContentTheme(): 'light' | 'dark' {
  return resolveThemePreference(
    currentPreference,
    systemPrefersDark ? 'dark' : 'light',
  );
}

export function applyContentThemeToElement(element: HTMLElement): void {
  const theme = resolvedContentTheme();
  element.dataset.genfeedTheme = theme;
  element.style.colorScheme = theme;
}

function applyContentTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): void {
  currentPreference = preference;
  systemPrefersDark = prefersDark;

  for (const element of document.querySelectorAll<HTMLElement>(
    CONTENT_THEME_SELECTOR,
  )) {
    applyContentThemeToElement(element);
  }
}

export function watchContentTheme(): () => void {
  const mediaQuery = window.matchMedia(CONTENT_THEME_MEDIA_QUERY);
  let disposed = false;
  let storageRevision = 0;

  applyContentTheme(currentPreference, mediaQuery.matches);

  const handleSystemThemeChange = (): void => {
    applyContentTheme(currentPreference, mediaQuery.matches);
  };
  const handleStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') {
      return;
    }

    const settingsChange = changes[EXTENSION_SETTINGS_STORAGE_KEY];
    if (settingsChange) {
      storageRevision += 1;
      applyContentTheme(
        readStoredTheme(settingsChange.newValue),
        mediaQuery.matches,
      );
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  chrome.storage.onChanged.addListener(handleStorageChange);

  const hydrationRevision = storageRevision;
  void chrome.storage.local
    .get(EXTENSION_SETTINGS_STORAGE_KEY)
    .then((result) => {
      if (!disposed && storageRevision === hydrationRevision) {
        applyContentTheme(
          readStoredTheme(result[EXTENSION_SETTINGS_STORAGE_KEY]),
          mediaQuery.matches,
        );
      }
    })
    .catch((error: unknown) => {
      logger.error('Failed to load content-script theme', error);
    });

  return () => {
    disposed = true;
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}
