import { resolveRequestLocale } from '@helpers/ui/locale/locale.helper';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './messages';

/**
 * Request-scoped i18n config (epic #2497).
 *
 * There is no `[locale]` route segment: the studio routes are
 * `/:orgSlug/:brandSlug/...` and a locale segment would collide with the
 * brand-scoped matching in `proxy.ts`. The locale comes from the cookie
 * instead, which is next-intl's documented setup without i18n routing.
 */
export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();

  return {
    locale,
    messages: loadMessages(locale),
  };
});
