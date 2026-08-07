import { type AppLocale, PSEUDO_LOCALE } from '@genfeedai/constants';
import common from '../messages/en/common.json';
import { pseudoLocalizeMessages } from './pseudo';

/**
 * The English catalog is the source of truth; every other locale is resolved
 * against it so a missing key degrades to English instead of a blank string
 * (epic #2497, FR-2).
 *
 * Namespaces are imported statically rather than fetched so the desktop
 * standalone bundle carries its own copy with no runtime network dependency.
 *
 * Splitting the catalog per route group — so a page pulls only the namespaces
 * it renders — lands with the migration slices, once there is enough copy for
 * the payload to matter. One namespace does not justify the indirection yet.
 */
const EN_MESSAGES = {
  common,
} as const;

export type AppMessages = typeof EN_MESSAGES;

export function loadMessages(locale: AppLocale): AppMessages {
  if (locale === PSEUDO_LOCALE) {
    return pseudoLocalizeMessages(EN_MESSAGES);
  }

  return EN_MESSAGES;
}
