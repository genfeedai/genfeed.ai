import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
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

  it('DEFAULT_THEME is "dark"', () => {
    expect(DEFAULT_THEME).toBe('dark');
  });
});
