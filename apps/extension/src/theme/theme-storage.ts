import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';

export const EXTENSION_SETTINGS_STORAGE_KEY = 'genfeed-settings';

export function readStoredTheme(settings: unknown): ThemePreference {
  if (typeof settings !== 'object' || settings === null) {
    return DEFAULT_THEME;
  }

  const theme = (settings as Record<string, unknown>).theme;
  return isThemePreference(theme) ? theme : DEFAULT_THEME;
}
