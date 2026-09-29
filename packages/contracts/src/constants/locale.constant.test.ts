import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  getSelectableLocales,
  isSupportedLocale,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  PSEUDO_LOCALE,
  resolveLocaleFromLanguage,
  resolvePreferredLocale,
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

    it('returns undefined for an empty value', () => {
      expect(resolveLocaleFromLanguage('   ')).toBeUndefined();
    });
  });

  describe('LOCALE_LABELS', () => {
    it('marks the pseudo-locale as a QA instrument rather than a language', () => {
      expect(LOCALE_LABELS[PSEUDO_LOCALE]).toContain('QA');
    });
  });

  describe('getSelectableLocales', () => {
    it('hides the pseudo-locale from customers', () => {
      expect(getSelectableLocales(false)).toEqual([DEFAULT_LOCALE]);
    });

    it('only ever returns allowlisted locales', () => {
      for (const locale of getSelectableLocales(true)) {
        expect(isSupportedLocale(locale)).toBe(true);
      }
    });
  });

  describe('resolvePreferredLocale', () => {
    it('prefers the user over the organization', () => {
      expect(
        resolvePreferredLocale({
          organizationLocale: DEFAULT_LOCALE,
          userLocale: PSEUDO_LOCALE,
        }),
      ).toBe(PSEUDO_LOCALE);
    });

    it('falls back to the organization default', () => {
      expect(
        resolvePreferredLocale({
          organizationLocale: PSEUDO_LOCALE,
          userLocale: null,
        }),
      ).toBe(PSEUDO_LOCALE);
    });

    it('ignores a stored value that is no longer allowlisted', () => {
      // A locale can be retired from the allowlist while rows still hold it;
      // treating it as "unset" degrades to negotiation instead of rendering
      // against a catalog that no longer exists.
      expect(
        resolvePreferredLocale({
          organizationLocale: 'de',
          userLocale: 'fr-CA',
        }),
      ).toBeUndefined();
    });
  });
});
