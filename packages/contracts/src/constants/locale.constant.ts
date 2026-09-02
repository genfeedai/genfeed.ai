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

/**
 * Display names for the language picker. English names on purpose: until real
 * translations land there is no catalog to source an endonym from, and the
 * pseudo-locale has no natural name at all.
 */
export const LOCALE_LABELS: Readonly<Record<AppLocale, string>> = {
  en: 'English',
  'en-XA': 'Pseudo-English (QA)',
};

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

/**
 * Locales offered in the language picker. The pseudo-locale is a QA instrument,
 * not a language, so it is hidden from production builds — a customer who lands
 * on it sees accented, padded English and reasonably reports it as a bug.
 */
export function getSelectableLocales(
  isPseudoLocaleVisible: boolean,
): readonly AppLocale[] {
  if (isPseudoLocaleVisible) {
    return SUPPORTED_LOCALES;
  }

  return SUPPORTED_LOCALES.filter((locale) => locale !== PSEUDO_LOCALE);
}

/**
 * The stored half of the `user → org → browser → en` precedence chain. The
 * browser and default tails belong to `resolveRequestLocale`, which is the only
 * place that can read `Accept-Language`; this returns `undefined` when neither
 * the user nor the organization has expressed a preference so the caller can
 * fall through to them.
 */
export function resolvePreferredLocale(preference: {
  organizationLocale?: string | null;
  userLocale?: string | null;
}): AppLocale | undefined {
  if (isSupportedLocale(preference.userLocale)) {
    return preference.userLocale;
  }

  if (isSupportedLocale(preference.organizationLocale)) {
    return preference.organizationLocale;
  }

  return undefined;
}
