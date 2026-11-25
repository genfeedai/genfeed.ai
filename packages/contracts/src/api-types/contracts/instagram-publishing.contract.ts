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

/** Instagram target setting naming the licensed track attached to a Reel. */
export const INSTAGRAM_AUDIO_ID_SETTING_KEY = 'audioId';
/** Instagram target setting for how loud the attached track plays (1-100). */
export const INSTAGRAM_AUDIO_VOLUME_SETTING_KEY = 'audioVolume';
/** Instagram target setting for how loud the Reel's own sound plays (1-100). */
export const INSTAGRAM_VIDEO_VOLUME_SETTING_KEY = 'videoVolume';

/** Lowest and highest volume the Instagram Audio API accepts. */
export const INSTAGRAM_AUDIO_VOLUME_MIN = 1;
export const INSTAGRAM_AUDIO_VOLUME_MAX = 100;

/**
 * The catalog entry for a Reel's music. It holds an `audio_id` from
 * Instagram's Audio API catalogue (`GET /ig_audio`), never a file: Instagram
 * only returns tracks cleared for third-party use, so the publisher cannot
 * attach anything it was not offered.
 */
export const INSTAGRAM_AUDIO_ID_SETTING: ChannelSettingDefinition = {
  description:
    'Instagram audio_id of a track from the Audio API catalogue. Only applies to Reels; leave blank to publish the Reel with its own sound.',
  key: INSTAGRAM_AUDIO_ID_SETTING_KEY,
  label: 'Reel music',
  type: 'string',
};

export const INSTAGRAM_AUDIO_VOLUME_SETTING: ChannelSettingDefinition = {
  description:
    'Volume of the attached track, 1 to 100. Instagram defaults to 100 when omitted.',
  key: INSTAGRAM_AUDIO_VOLUME_SETTING_KEY,
  label: 'Music volume',
  type: 'number',
};

export const INSTAGRAM_VIDEO_VOLUME_SETTING: ChannelSettingDefinition = {
  description:
    "Volume of the Reel's own sound, 1 to 100. Instagram defaults to 100 when omitted.",
  key: INSTAGRAM_VIDEO_VOLUME_SETTING_KEY,
  label: 'Reel sound volume',
  type: 'number',
};

/** Every setting Instagram publishing adds to the catalog beyond `placement`. */
export const INSTAGRAM_PUBLISHING_SETTINGS: ChannelSettingDefinition[] = [
  INSTAGRAM_AI_GENERATED_SETTING,
  INSTAGRAM_COVER_IMAGE_SETTING,
  INSTAGRAM_AUDIO_ID_SETTING,
  INSTAGRAM_AUDIO_VOLUME_SETTING,
  INSTAGRAM_VIDEO_VOLUME_SETTING,
];

/** The `audio_configuration` Instagram's Audio API takes on a Reel container. */
export interface InstagramAudioConfiguration {
  audio_id: string;
  audio_volume?: number;
  video_volume?: number;
}

/**
 * Validates the Reel music settings. Music and volumes are Reel-only, and a
 * volume without a track would be silently ignored, so both are refused
 * instead of accepted and dropped. Returns plain messages for the caller to
 * wrap in its own issue shape.
 */
export function validateInstagramAudioSettings(
  settings: Record<string, unknown>,
): string[] {
  const audioId = settings[INSTAGRAM_AUDIO_ID_SETTING_KEY];
  const hasAudio = typeof audioId === 'string' && audioId.trim().length > 0;
  const issues: string[] = [];

  for (const key of [
    INSTAGRAM_AUDIO_VOLUME_SETTING_KEY,
    INSTAGRAM_VIDEO_VOLUME_SETTING_KEY,
  ]) {
    const value = settings[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'number') continue; // the type check reports this
    if (
      !Number.isInteger(value) ||
      value < INSTAGRAM_AUDIO_VOLUME_MIN ||
      value > INSTAGRAM_AUDIO_VOLUME_MAX
    ) {
      issues.push(
        `Instagram ${key} must be a whole number from ${INSTAGRAM_AUDIO_VOLUME_MIN} to ${INSTAGRAM_AUDIO_VOLUME_MAX}.`,
      );
    } else if (!hasAudio) {
      issues.push(
        `Instagram ${key} needs an ${INSTAGRAM_AUDIO_ID_SETTING_KEY}.`,
      );
    }
  }

  if (hasAudio && settings.placement !== 'reel') {
    issues.push('Instagram music can only be attached to a Reel.');
  }

  return issues;
}

/**
 * Longest text alternative Instagram accepts for an image (`alt_text`). The
 * Library caps an image's alt text at the same length, so what is saved is
 * what is sent.
 */
export const INSTAGRAM_ALT_TEXT_MAX_LENGTH = 1000;

/** The two catalogues Instagram's Audio API lists. */
export const INSTAGRAM_AUDIO_TYPES = ['music', 'original_sound'] as const;
export type InstagramAudioType = (typeof INSTAGRAM_AUDIO_TYPES)[number];

/** One track from Instagram's Audio API catalogue (`GET /ig_audio`). */
export interface InstagramAudioTrack {
  /** Pass this as the `audioId` target setting. */
  id: string;
  title: string;
  /** Only music tracks name an artist. */
  artist?: string;
  durationMs?: number;
  audioType: InstagramAudioType;
  coverArtworkUrl?: string;
  /** Link to listen to the track on Instagram. */
  previewUrl?: string;
  /** Only original sounds name the account that made them. */
  igUsername?: string;
  isAdsEligible?: boolean;
}
