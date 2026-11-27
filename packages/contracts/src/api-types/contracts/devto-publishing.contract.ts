/**
 * Dev.to target settings that change what the publisher sends to the Forem
 * API. The catalog ({@link ./channel-capabilities.contract}) lists them and
 * the publisher reads them through the same keys.
 */

import type { ChannelSettingDefinition } from './channel-setting-validation.contract';

export const DEVTO_TAGS_SETTING_KEY = 'tags';
export const DEVTO_CANONICAL_URL_SETTING_KEY = 'canonicalUrl';
export const DEVTO_SERIES_SETTING_KEY = 'series';
export const DEVTO_SAVE_AS_DRAFT_SETTING_KEY = 'saveAsDraft';

/**
 * Tags, canonical URL, series and draft delivery. Without a canonical URL Dev.to is the
 * original, so set it when the article was first published elsewhere.
 */
export const DEVTO_PUBLISHING_SETTINGS: ChannelSettingDefinition[] = [
  {
    description: 'Up to 4 comma-separated tags. Later tags are dropped.',
    key: DEVTO_TAGS_SETTING_KEY,
    label: 'Tags',
    type: 'string',
  },
  {
    description:
      'https URL of the original article when it was first published elsewhere, so search credit stays there. Leave empty when Dev.to is the original.',
    key: DEVTO_CANONICAL_URL_SETTING_KEY,
    label: 'Canonical URL',
    type: 'string',
  },
  {
    description:
      'Series name. Dev.to creates the series on first use and groups later posts with the same name.',
    key: DEVTO_SERIES_SETTING_KEY,
    label: 'Series',
    type: 'string',
  },
  {
    defaultValue: false,
    description:
      'Create the article as a private Dev.to draft (published: false) instead of publishing it. Open it in the Dev.to editor to review and publish.',
    key: DEVTO_SAVE_AS_DRAFT_SETTING_KEY,
    label: 'Save as Dev.to draft',
    type: 'boolean',
  },
];
