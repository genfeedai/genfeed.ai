/**
 * YouTube target settings that change what the publisher sends to the Data
 * API. The catalog ({@link ./channel-capabilities.contract}) lists them and
 * the publisher reads them through the same keys.
 */

import type { ChannelSettingDefinition } from './channel-setting-validation.contract';

/** YouTube target setting that discloses altered or synthetic content. */
export const YOUTUBE_AI_GENERATED_SETTING_KEY = 'aiGenerated';

/**
 * The catalog entry for the altered or synthetic content disclosure
 * (`status.containsSyntheticMedia`). On by default because what Genfeed
 * publishes is generated in Genfeed; turn it off for a real video you
 * uploaded.
 */
export const YOUTUBE_AI_GENERATED_SETTING: ChannelSettingDefinition = {
  defaultValue: true,
  description:
    'Tells YouTube the video contains altered or synthetic content. Turn it off for a real video you uploaded.',
  key: YOUTUBE_AI_GENERATED_SETTING_KEY,
  label: 'Label as AI-generated',
  type: 'boolean',
};
