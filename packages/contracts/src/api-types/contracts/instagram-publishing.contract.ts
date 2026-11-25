/**
 * Instagram target settings that change what the publisher sends to the Graph
 * API. The catalog ({@link ./channel-capabilities.contract}) lists them and the
 * publisher reads them through the same keys.
 */

import type { ChannelSettingDefinition } from './channel-setting-validation.contract';

/** Instagram target setting that labels a post as AI-generated. */
export const INSTAGRAM_AI_GENERATED_SETTING_KEY = 'aiGenerated';

/**
 * The catalog entry for the AI label. On by default because what Genfeed
 * publishes is generated in Genfeed; turn it off for a real photo you
 * uploaded.
 */
export const INSTAGRAM_AI_GENERATED_SETTING: ChannelSettingDefinition = {
  defaultValue: true,
  description:
    'Sends the AI-generated label to Instagram. Turn it off for a real photo or video you uploaded.',
  key: INSTAGRAM_AI_GENERATED_SETTING_KEY,
  label: 'Label as AI-generated',
  type: 'boolean',
};

/** Instagram target setting naming the Library image used as a Reel's cover. */
export const INSTAGRAM_COVER_IMAGE_SETTING_KEY = 'coverImageId';

/**
 * The catalog entry for a Reel's cover. It holds a Library image id, never a
 * URL: the publisher turns the id into a short-lived link inside the
 * organization, so another tenant's image can never be named.
 */
export const INSTAGRAM_COVER_IMAGE_SETTING: ChannelSettingDefinition = {
  description:
    'Library image id used as the Reel cover. Only applies to Reels; leave blank to let Instagram pick a frame.',
  key: INSTAGRAM_COVER_IMAGE_SETTING_KEY,
  label: 'Reel cover image',
  type: 'string',
};

/** Every setting Instagram publishing adds to the catalog beyond `placement`. */
export const INSTAGRAM_PUBLISHING_SETTINGS: ChannelSettingDefinition[] = [
  INSTAGRAM_AI_GENERATED_SETTING,
  INSTAGRAM_COVER_IMAGE_SETTING,
];

/**
 * Longest text alternative Instagram accepts for an image (`alt_text`). The
 * Library caps an image's alt text at the same length, so what is saved is
 * what is sent.
 */
export const INSTAGRAM_ALT_TEXT_MAX_LENGTH = 1000;
