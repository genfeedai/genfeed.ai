import { type AppLocale, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import agent from '../messages/en/agent.json';
import common from '../messages/en/common.json';
import pages from '../messages/en/pages.json';
import { pseudoLocalizeMessages } from './pseudo';

/**
 * The English catalog is the source of truth; every other locale is resolved
 * against it so a missing key degrades to English instead of a blank string
 * (epic #2497, FR-2).
 *
 * Namespaces are imported statically rather than fetched so the desktop
 * standalone bundle carries its own copy with no runtime network dependency.
 *
 * Shared packages consume this host catalog: `agent`, `pages`, and (when they
 * first catalog copy) `ui` / `contexts`. `common` is the app-owned namespace.
 * See `.agents/memory/project_shared_package_message_catalogs.md`.
 *
 * Splitting a namespace file further — so a page pulls only the keys it
 * renders — lands once a file is large enough for the payload to matter.
 */
const EN_MESSAGES = {
  agent,
  common,
  pages,
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
