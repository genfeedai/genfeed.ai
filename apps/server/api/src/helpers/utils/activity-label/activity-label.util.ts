import { ActivityKey } from '@genfeedai/enums';

const LABEL_MAP: Record<string, string> = {
  [ActivityKey.VIDEO_GENERATED]: 'Video Generation',
  [ActivityKey.VIDEO_REFRAME_COMPLETED]: 'Video Reframe',
  [ActivityKey.VIDEO_UPSCALE_COMPLETED]: 'Video Upscale',
  [ActivityKey.IMAGE_GENERATED]: 'Image Generation',
  [ActivityKey.IMAGE_REFRAME_COMPLETED]: 'Image Reframe',
  [ActivityKey.IMAGE_UPSCALE_COMPLETED]: 'Image Upscale',
  [ActivityKey.MUSIC_GENERATED]: 'Music Generation',
  [ActivityKey.VIDEO_FAILED]: 'Video Generation',
  [ActivityKey.IMAGE_FAILED]: 'Image Generation',
  [ActivityKey.MUSIC_FAILED]: 'Music Generation',
  [ActivityKey.VIDEO_PROCESSING]: 'Video Generation',
  [ActivityKey.IMAGE_PROCESSING]: 'Image Generation',
  [ActivityKey.MUSIC_PROCESSING]: 'Music Generation',
};

const RESULT_TYPE_MAP: Record<string, string> = {
  [ActivityKey.VIDEO_GENERATED]: 'VIDEO',
  [ActivityKey.VIDEO_REFRAME_COMPLETED]: 'VIDEO',
  [ActivityKey.VIDEO_UPSCALE_COMPLETED]: 'VIDEO',
  [ActivityKey.VIDEO_FAILED]: 'VIDEO',
  [ActivityKey.VIDEO_PROCESSING]: 'VIDEO',
  [ActivityKey.VIDEO_COMPLETED]: 'VIDEO',
  [ActivityKey.IMAGE_GENERATED]: 'IMAGE',
  [ActivityKey.IMAGE_REFRAME_COMPLETED]: 'IMAGE',
  [ActivityKey.IMAGE_UPSCALE_COMPLETED]: 'IMAGE',
  [ActivityKey.IMAGE_FAILED]: 'IMAGE',
  [ActivityKey.IMAGE_PROCESSING]: 'IMAGE',
  [ActivityKey.MUSIC_GENERATED]: 'MUSIC',
  [ActivityKey.MUSIC_FAILED]: 'MUSIC',
  [ActivityKey.MUSIC_PROCESSING]: 'MUSIC',
};

/**
 * Returns a human-readable label for a given ActivityKey.
 * Replaces inline switch/ternary chains in webhooks.service.ts.
 */
export function getActivityLabel(key: ActivityKey): string {
  return LABEL_MAP[key] || 'Content Generation';
}

/**
 * Returns the result type (VIDEO, IMAGE, MUSIC) for a given ActivityKey.
 * Replaces inline ternary chains in webhooks.service.ts.
 */
export function getActivityResultType(key: ActivityKey): string | undefined {
  return RESULT_TYPE_MAP[key];
}
