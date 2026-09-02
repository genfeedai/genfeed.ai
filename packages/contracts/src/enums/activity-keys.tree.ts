import { ActivityKey } from './activity.enum';

/**
 * Hierarchical ActivityKey accessors for DX.
 *
 * Wire values remain the flat kebab-case strings on `ActivityKey` (DB contract).
 * Prefer `ActivityKeys.video.reframe.processing` in new code; keep writing the
 * same string to Prisma.
 *
 * Shape: ActivityKeys.{subject}.{operation}.{lifecycle}
 */
export const ActivityKeys = {
  article: {
    generate: {
      completed: ActivityKey.ARTICLE_GENERATED,
      failed: ActivityKey.ARTICLE_FAILED,
      processing: ActivityKey.ARTICLE_PROCESSING,
    },
  },
  brand: {
    relocate: {
      completed: ActivityKey.BRAND_RELOCATED,
    },
  },
  credits: {
    add: ActivityKey.CREDITS_ADD,
    remove: ActivityKey.CREDITS_REMOVE,
    removeAll: ActivityKey.CREDITS_REMOVE_ALL,
    reset: ActivityKey.CREDITS_RESET,
  },
  image: {
    generate: {
      completed: ActivityKey.IMAGE_GENERATED,
      failed: ActivityKey.IMAGE_FAILED,
      processing: ActivityKey.IMAGE_PROCESSING,
    },
    reframe: {
      completed: ActivityKey.IMAGE_REFRAME_COMPLETED,
      failed: ActivityKey.IMAGE_REFRAME_FAILED,
      processing: ActivityKey.IMAGE_REFRAME_PROCESSING,
    },
    upscale: {
      completed: ActivityKey.IMAGE_UPSCALE_COMPLETED,
      failed: ActivityKey.IMAGE_UPSCALE_FAILED,
      processing: ActivityKey.IMAGE_UPSCALE_PROCESSING,
    },
  },
  integration: {
    social: {
      disconnected: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      failed: ActivityKey.SOCIAL_INTEGRATION_FAILED,
    },
  },
  model: {
    train: {
      completed: ActivityKey.MODELS_TRAINING_COMPLETED,
      created: ActivityKey.MODELS_TRAINING_CREATED,
      failed: ActivityKey.MODELS_TRAINING_FAILED,
    },
  },
  music: {
    generate: {
      completed: ActivityKey.MUSIC_GENERATED,
      failed: ActivityKey.MUSIC_FAILED,
      processing: ActivityKey.MUSIC_PROCESSING,
    },
  },
  post: {
    generate: {
      completed: ActivityKey.POST_GENERATED,
      created: ActivityKey.POST_CREATED,
      failed: ActivityKey.POST_FAILED,
      processing: ActivityKey.POST_PROCESSING,
      published: ActivityKey.POST_PUBLISHED,
      scheduled: ActivityKey.POST_SCHEDULED,
    },
  },
  prompt: {
    enhance: {
      completed: ActivityKey.PROMPT_ENHANCE_COMPLETED,
      failed: ActivityKey.PROMPT_ENHANCE_FAILED,
      processing: ActivityKey.PROMPT_ENHANCE_PROCESSING,
    },
    remix: {
      completed: ActivityKey.PROMPT_REMIX_COMPLETED,
      failed: ActivityKey.PROMPT_REMIX_FAILED,
      processing: ActivityKey.PROMPT_REMIX_PROCESSING,
    },
  },
  video: {
    generate: {
      completed: ActivityKey.VIDEO_GENERATED,
      failed: ActivityKey.VIDEO_FAILED,
      finished: ActivityKey.VIDEO_COMPLETED,
      processing: ActivityKey.VIDEO_PROCESSING,
      scheduled: ActivityKey.VIDEO_SCHEDULED,
    },
    reframe: {
      completed: ActivityKey.VIDEO_REFRAME_COMPLETED,
      failed: ActivityKey.VIDEO_REFRAME_FAILED,
      processing: ActivityKey.VIDEO_REFRAME_PROCESSING,
    },
    upscale: {
      completed: ActivityKey.VIDEO_UPSCALE_COMPLETED,
      failed: ActivityKey.VIDEO_UPSCALE_FAILED,
      processing: ActivityKey.VIDEO_UPSCALE_PROCESSING,
    },
  },
  voice: {
    generate: {
      completed: ActivityKey.VOICE_GENERATED,
      failed: ActivityKey.VOICE_FAILED,
      processing: ActivityKey.VOICE_PROCESSING,
    },
  },
} as const;

export type ActivityKeysTree = typeof ActivityKeys;
