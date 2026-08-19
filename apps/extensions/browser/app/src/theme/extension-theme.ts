import {
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@genfeedai/constants';

export const EXTENSION_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function applyResolvedTheme(
  theme: ResolvedTheme,
  targetDocument: Document,
): void {
  for (const element of [
    targetDocument.documentElement,
    targetDocument.body,
  ]) {
    element.dataset.theme = theme;
    element.classList.toggle('dark', theme === 'dark');
    element.style.colorScheme = theme;
  }
}

export function applyExtensionTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  targetDocument: Document = document,
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(
    preference,
    systemPrefersDark ? 'dark' : 'light',
  );

  applyResolvedTheme(resolvedTheme, targetDocument);
  return resolvedTheme;
}

export function watchExtensionTheme(
  preference: ThemePreference,
  targetDocument: Document = document,
  mediaQuery: MediaQueryList = window.matchMedia(EXTENSION_THEME_MEDIA_QUERY),
): () => void {
  applyExtensionTheme(preference, mediaQuery.matches, targetDocument);

  if (preference !== 'system') {
    return () => undefined;
  }

  const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
    applyExtensionTheme(preference, event.matches, targetDocument);
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  return () => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
  };
}
