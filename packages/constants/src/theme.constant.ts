export type ThemePreference = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export const THEME_COOKIE_NAME = 'theme';

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const DEFAULT_THEME: ThemePreference = 'dark';
