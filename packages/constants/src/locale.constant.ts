/**
 * Locale allowlist and cookie contract (epic #2497).
 *
 * Locale is carried by cookie, not by a URL segment: the studio routes are
 * `/:orgSlug/:brandSlug/...` and a `[locale]` segment would collide with the
 * brand-scoped matching in `apps/app/proxy.ts`. Resolution mirrors
 * `theme.constant.ts` / `resolveRequestTheme` so both preferences behave the
 * same way on the server.
 */

/**
 * `en-XA` is the pseudo-locale: accented, padded English generated from the
 * `en` catalog at load time. It exists to prove the pipeline and to make
 * untranslated strings visible in QA — it is never a shipped language.
 */
export type AppLocale = 'en' | 'en-XA';

export const DEFAULT_LOCALE: AppLocale = 'en';

export const PSEUDO_LOCALE: AppLocale = 'en-XA';

export const SUPPORTED_LOCALES: readonly AppLocale[] = ['en', 'en-XA'] as const;

export const LOCALE_STORAGE_KEY = 'locale';

export const LOCALE_COOKIE_NAME = 'locale';

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isSupportedLocale(value: unknown): value is AppLocale {
  return (
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value as AppLocale)
  );
}

/**
 * Match a bare language subtag (`en`) against the allowlist so an
 * `Accept-Language: en-GB` request still resolves to `en`. Exact matches are
 * handled by `isSupportedLocale` before this is consulted.
 */
export function resolveLocaleFromLanguage(
  language: string,
): AppLocale | undefined {
  const normalized = language.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === normalized,
  );
}
