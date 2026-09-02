import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLVED_THEME,
  DEFAULT_THEME,
  isResolvedTheme,
  isThemePreference,
  RESOLVED_THEMES,
  resolveThemePreference,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from './theme.constant';

describe('theme.constant', () => {
  it('THEME_STORAGE_KEY is "theme"', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });

  it('THEME_COOKIE_NAME is "theme"', () => {
    expect(THEME_COOKIE_NAME).toBe('theme');
  });

  it('THEME_COOKIE_MAX_AGE is 1 year in seconds', () => {
    expect(THEME_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });

  it('defines the complete stored and resolved theme vocabularies', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
    expect(RESOLVED_THEMES).toEqual(['light', 'dark']);
  });

  it('defaults new preferences to the system appearance', () => {
    expect(DEFAULT_THEME).toBe('system');
    expect(DEFAULT_RESOLVED_THEME).toBe('dark');
  });

  it.each(['system', 'light', 'dark'])('accepts the %s preference', (theme) => {
    expect(isThemePreference(theme)).toBe(true);
  });

  it.each([undefined, null, '', 'solarized', 'LIGHT'])(
    'rejects the invalid %s preference',
    (theme) => {
      expect(isThemePreference(theme)).toBe(false);
    },
  );

  it('accepts only resolved Light and Dark values', () => {
    expect(isResolvedTheme('light')).toBe(true);
    expect(isResolvedTheme('dark')).toBe(true);
    expect(isResolvedTheme('system')).toBe(false);
  });

  it('resolves System against the host while preserving explicit themes', () => {
    expect(resolveThemePreference('system', 'light')).toBe('light');
    expect(resolveThemePreference('system', undefined)).toBe(
      DEFAULT_RESOLVED_THEME,
    );
    expect(resolveThemePreference('light', 'dark')).toBe('light');
    expect(resolveThemePreference('dark', 'light')).toBe('dark');
  });
});
