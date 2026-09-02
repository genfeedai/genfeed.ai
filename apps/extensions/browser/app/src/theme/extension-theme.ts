import {
  DEFAULT_RESOLVED_THEME,
  DEFAULT_THEME,
  type ResolvedTheme,
  resolveThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  readStoredTheme,
} from '~theme/theme-storage';

export const EXTENSION_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function applyResolvedTheme(
  theme: ResolvedTheme,
  targetDocument: Document,
): void {
  for (const element of [targetDocument.documentElement, targetDocument.body]) {
    if (!element) {
      continue;
    }

    element.dataset.theme = theme;
    element.classList.toggle('dark', theme === 'dark');
    element.style.colorScheme = theme;
  }
}

function readSystemMediaQuery(
  mediaQuery?: MediaQueryList,
): MediaQueryList | null {
  if (mediaQuery) {
    return mediaQuery;
  }

  try {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia(EXTENSION_THEME_MEDIA_QUERY);
    }
  } catch {
    // The deterministic fallback remains available without matchMedia.
  }

  return null;
}

function systemPrefersDark(mediaQuery: MediaQueryList | null): boolean {
  return mediaQuery?.matches ?? DEFAULT_RESOLVED_THEME === 'dark';
}

function subscribeToMediaQuery(
  mediaQuery: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  }

  mediaQuery.addListener(listener);
  return () => {
    mediaQuery.removeListener(listener);
  };
}

export function applyExtensionTheme(
  preference: ThemePreference,
  systemPrefersDarkValue: boolean,
  targetDocument: Document = document,
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(
    preference,
    systemPrefersDarkValue ? 'dark' : 'light',
  );

  applyResolvedTheme(resolvedTheme, targetDocument);
  return resolvedTheme;
}

export function watchExtensionTheme(
  preference: ThemePreference,
  targetDocument: Document = document,
  mediaQuery?: MediaQueryList,
): () => void {
  const resolvedMediaQuery = readSystemMediaQuery(mediaQuery);
  applyExtensionTheme(
    preference,
    systemPrefersDark(resolvedMediaQuery),
    targetDocument,
  );

  if (preference !== 'system' || !resolvedMediaQuery) {
    return () => undefined;
  }

  const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
    applyExtensionTheme(preference, event.matches, targetDocument);
  };

  return subscribeToMediaQuery(resolvedMediaQuery, handleSystemThemeChange);
}

export async function hydrateExtensionThemeBeforePaint(
  targetDocument: Document = document,
  storage: Pick<chrome.storage.StorageArea, 'get'> = chrome.storage.local,
): Promise<ResolvedTheme> {
  const root = targetDocument.documentElement;
  root.style.visibility = 'hidden';

  try {
    const result = await storage.get(EXTENSION_SETTINGS_STORAGE_KEY);
    const preference = readStoredTheme(result[EXTENSION_SETTINGS_STORAGE_KEY]);

    return applyExtensionTheme(
      preference,
      systemPrefersDark(readSystemMediaQuery()),
      targetDocument,
    );
  } catch {
    return applyExtensionTheme(
      DEFAULT_THEME,
      systemPrefersDark(readSystemMediaQuery()),
      targetDocument,
    );
  } finally {
    root.style.visibility = '';
  }
}
