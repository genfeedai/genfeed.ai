import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  PSEUDO_LOCALE,
  resolveLocaleFromLanguage,
  SUPPORTED_LOCALES,
} from './locale.constant';

describe('locale.constant', () => {
  it('LOCALE_STORAGE_KEY is "locale"', () => {
    expect(LOCALE_STORAGE_KEY).toBe('locale');
  });

  it('LOCALE_COOKIE_NAME is "locale"', () => {
    expect(LOCALE_COOKIE_NAME).toBe('locale');
  });

  it('LOCALE_COOKIE_MAX_AGE is 1 year in seconds', () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });

  it('DEFAULT_LOCALE is "en"', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('PSEUDO_LOCALE is "en-XA"', () => {
    expect(PSEUDO_LOCALE).toBe('en-XA');
  });

  it('SUPPORTED_LOCALES contains the default and the pseudo-locale', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expect(SUPPORTED_LOCALES).toContain(PSEUDO_LOCALE);
  });

  describe('isSupportedLocale', () => {
    it.each(SUPPORTED_LOCALES)('accepts %s', (locale) => {
      expect(isSupportedLocale(locale)).toBe(true);
    });

    it.each([
      ['an unlisted language', 'de'],
      ['an empty string', ''],
      ['a region-only tag', 'XA'],
      ['undefined', undefined],
      ['null', null],
      ['a number', 42],
    ])('rejects %s', (_label, value) => {
      expect(isSupportedLocale(value)).toBe(false);
    });

    it('is case sensitive so cookies cannot smuggle a variant spelling', () => {
      expect(isSupportedLocale('EN')).toBe(false);
      expect(isSupportedLocale('en-xa')).toBe(false);
    });
  });

  describe('resolveLocaleFromLanguage', () => {
    it('matches an allowlisted locale case-insensitively', () => {
      expect(resolveLocaleFromLanguage('EN')).toBe('en');
      expect(resolveLocaleFromLanguage('en-xa')).toBe('en-XA');
    });

    it('trims surrounding whitespace', () => {
      expect(resolveLocaleFromLanguage('  en  ')).toBe('en');
    });

    it('returns undefined for an unlisted language', () => {
      expect(resolveLocaleFromLanguage('de')).toBeUndefined();
    });

    it('returns undefined for an empty value', () => {
      expect(resolveLocaleFromLanguage('   ')).toBeUndefined();
    });
  });
});
