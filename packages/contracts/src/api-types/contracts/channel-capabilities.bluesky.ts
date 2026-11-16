import { Platform } from '../../enums/platform.enum';

/** Keeps each member a literal type while the array stays mutable. */
const list = <T extends string>(...items: T[]): T[] => items;

/**
 * Bluesky: text, image and video posts, and reply threads, on a connected
 * account. Kept beside the catalog so the catalog file stays under its
 * file-size ratchet. The catalog parses it through `channelCapabilitySchema`
 * and checks it with `satisfies`, so it carries no type of its own (importing
 * one would be an import cycle).
 */
export const blueskyChannelCapability = {
  caption: { maxLength: 300, required: false },
  description:
    'Text, image and video posts, and reply threads, on a connected Bluesky account.',
  helpers: [
    {
      key: 'bluesky.accounts',
      kind: 'account' as const,
      label: 'Bluesky account',
      required: true,
    },
  ],
  label: 'Bluesky',
  media: {
    // A post carries up to 4 images or one video, never both. Bluesky
    // rejects an image over 1 MB, so the publisher downscales each one.
    animated: {
      consequence:
        'Animated images publish as a static image; upload a video to keep motion.',
      supported: false,
    },
    images: { maxItems: 4, minItems: 1 },
    kinds: list('image', 'video', 'short_video', 'carousel', 'link'),
    maxItems: 4,
    minItems: 0,
  },
  platform: Platform.BLUESKY,
  publishModes: list('draft', 'publish_now', 'scheduled'),
  settings: [],
  status: 'supported' as const,
};
