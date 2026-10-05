import { DEFAULT_LOCALE } from '@helpers/ui/locale/locale.helper';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './messages';

// The App Shell has one static locale until epic #2497 adopts a
// prerender-compatible strategy for additional languages.
export default getRequestConfig(() => ({
  locale: DEFAULT_LOCALE,
  messages: loadMessages(DEFAULT_LOCALE),
}));
