import {
  type AppLocale,
  isSupportedLocale,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
} from '@genfeedai/contracts/constants';

/**
 * Client half of the locale cookie contract. `locale.helper.ts` owns the server
 * half and imports `next/headers`, which cannot be bundled into a client
 * component — hence the split file rather than one module with both directions.
 */

export function readLocaleCookie(cookieSource: string): AppLocale | undefined {
  for (const entry of cookieSource.split(';')) {
    const separatorIndex = entry.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    if (entry.slice(0, separatorIndex).trim() !== LOCALE_COOKIE_NAME) {
      continue;
    }

    const value = decodeURIComponent(entry.slice(separatorIndex + 1).trim());

    return isSupportedLocale(value) ? value : undefined;
  }

  return undefined;
}

export function buildLocaleCookie(
  locale: AppLocale,
  isSecure: boolean,
): string {
  const segments = [
    `${LOCALE_COOKIE_NAME}=${locale}`,
    'path=/',
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
    'SameSite=Lax',
  ];

  if (isSecure) {
    segments.push('Secure');
  }

  return segments.join('; ');
}

/**
 * Persist the locale for the next server render. Returns whether the cookie
 * changed so callers can refresh the route tree only when it matters — an
 * unconditional refresh here would loop.
 */
export function writeLocaleCookie(locale: AppLocale): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  if (readLocaleCookie(document.cookie) === locale) {
    return false;
  }

  document.cookie = buildLocaleCookie(
    locale,
    typeof window !== 'undefined' && window.location.protocol === 'https:',
  );

  return true;
}
