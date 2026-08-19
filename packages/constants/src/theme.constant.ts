export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const RESOLVED_THEMES = ['light', 'dark'] as const;

export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

export const THEME_STORAGE_KEY = 'theme';

export const THEME_COOKIE_NAME = 'theme';

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const DEFAULT_THEME: ThemePreference = 'system';

// Used only until a platform can report the host color scheme. Web clients
// replace this during the next-themes bootstrap before hydration.
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((theme) => theme === value);
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return RESOLVED_THEMES.some((theme) => theme === value);
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemTheme?: ResolvedTheme | null,
): ResolvedTheme {
  if (preference === 'system') {
    return systemTheme ?? DEFAULT_RESOLVED_THEME;
  }

  return preference;
}
