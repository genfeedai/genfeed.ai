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

type MessageTree = {
  readonly [key: string]: MessageTree | string;
};

function mergeMessageTree(
  english: MessageTree,
  localized: MessageTree,
): MessageTree {
  const merged: Record<string, MessageTree | string> = {};

  for (const [key, englishValue] of Object.entries(english)) {
    const localizedValue = localized[key];

    if (typeof englishValue === 'string') {
      merged[key] =
        typeof localizedValue === 'string' ? localizedValue : englishValue;
      continue;
    }

    merged[key] = mergeMessageTree(
      englishValue,
      typeof localizedValue === 'object' ? localizedValue : {},
    );
  }

  return merged;
}

/** Resolve a partial locale pack key-by-key against the English source. */
export function mergeMessagesWithEnglish(localized: MessageTree): AppMessages {
  return mergeMessageTree(EN_MESSAGES, localized) as AppMessages;
}

export function loadMessages(locale: AppLocale): AppMessages {
  if (locale === PSEUDO_LOCALE) {
    return mergeMessagesWithEnglish(pseudoLocalizeMessages(EN_MESSAGES));
  }

  return mergeMessagesWithEnglish({});
}
