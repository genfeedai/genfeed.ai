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
