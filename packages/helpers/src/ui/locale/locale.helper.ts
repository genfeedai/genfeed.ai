import {
  type AppLocale,
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  resolveLocaleFromLanguage,
} from '@genfeedai/contracts/constants';
import { cookies, headers } from 'next/headers';

/**
 * Pick the highest-quality allowlisted locale out of an `Accept-Language`
 * header. Exact tags win; otherwise the bare language subtag is tried so
 * `en-GB` still resolves to `en`.
 */
export function negotiateAcceptLanguage(
  header: string | null,
): AppLocale | undefined {
  if (!header) {
    return undefined;
  }

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.split(';');
      const qualityParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='));
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.slice(2))
        : 1;

      return {
        quality: Number.isFinite(quality) ? quality : 0,
        tag: tag.trim(),
      };
    })
    // `q=0` explicitly means "not acceptable", so it must never be selected.
    .filter((candidate) => candidate.tag && candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const { tag } of candidates) {
    const exact = resolveLocaleFromLanguage(tag);

    if (exact) {
      return exact;
    }

    const [language] = tag.split('-');
    const fromLanguage = language
      ? resolveLocaleFromLanguage(language)
      : undefined;

    if (fromLanguage) {
      return fromLanguage;
    }
  }

  return undefined;
}

/**
 * Server-side locale for the current request, mirroring `resolveRequestTheme`.
 *
 * The cookie is the carrier for the stored user preference: `LocaleCookieSync`
 * writes it on the client the same way `ThemeCookieSync` writes the theme, so
 * a signed-in user's `Setting.locale` reaches the server on the very first
 * paint without a database round trip in the render path. `Accept-Language` is
 * consulted only when nothing is stored, and only for allowlisted languages.
 */
export async function resolveRequestLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  if (isSupportedLocale(locale)) {
    return locale;
  }

  const headerList = await headers();
  const negotiated = negotiateAcceptLanguage(headerList.get('accept-language'));

  return negotiated ?? DEFAULT_LOCALE;
}
