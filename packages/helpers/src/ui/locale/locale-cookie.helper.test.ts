import { LOCALE_COOKIE_MAX_AGE } from '@genfeedai/contracts/constants';
import {
  buildLocaleCookie,
  readLocaleCookie,
  writeLocaleCookie,
} from '@helpers/ui/locale/locale-cookie.helper';
import { beforeEach, describe, expect, it } from 'vitest';

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();

    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

describe('readLocaleCookie', () => {
  it('reads the locale out of a multi-cookie header', () => {
    expect(readLocaleCookie('theme=dark; locale=en-XA; other=1')).toBe('en-XA');
  });

  it('ignores a cookie whose name merely ends with the locale name', () => {
    // `document.cookie` is a flat string, so a sloppy `includes` check would
    // read `applocale` as the locale and render against the wrong catalog.
    expect(readLocaleCookie('applocale=en-XA')).toBeUndefined();
  });

  it('rejects a value that is not allowlisted', () => {
    expect(readLocaleCookie('locale=de')).toBeUndefined();
  });

  it('returns undefined when the cookie is absent', () => {
    expect(readLocaleCookie('theme=dark')).toBeUndefined();
  });

  it('returns undefined for an empty cookie string', () => {
    expect(readLocaleCookie('')).toBeUndefined();
  });
});

describe('buildLocaleCookie', () => {
  it('scopes the cookie to the whole site for a year', () => {
    const cookie = buildLocaleCookie('en', false);

    expect(cookie).toContain('locale=en');
    expect(cookie).toContain('path=/');
    expect(cookie).toContain(`max-age=${LOCALE_COOKIE_MAX_AGE}`);
    expect(cookie).toContain('SameSite=Lax');
  });

  it('omits Secure on plain http so local development still stores it', () => {
    expect(buildLocaleCookie('en', false)).not.toContain('Secure');
  });

  it('adds Secure over https', () => {
    expect(buildLocaleCookie('en', true)).toContain('Secure');
  });
});

describe('writeLocaleCookie', () => {
  beforeEach(() => {
    clearCookies();
  });

  it('stores the locale and reports the change', () => {
    expect(writeLocaleCookie('en-XA')).toBe(true);
    expect(readLocaleCookie(document.cookie)).toBe('en-XA');
  });

  it('reports no change when the cookie already holds the locale', () => {
    writeLocaleCookie('en-XA');

    // The caller refreshes the route tree on `true`; returning `true` here
    // would refresh on every render and never settle.
    expect(writeLocaleCookie('en-XA')).toBe(false);
  });

  it('overwrites a different stored locale', () => {
    writeLocaleCookie('en');

    expect(writeLocaleCookie('en-XA')).toBe(true);
    expect(readLocaleCookie(document.cookie)).toBe('en-XA');
  });
});
