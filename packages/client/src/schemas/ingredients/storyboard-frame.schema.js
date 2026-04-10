import {
  DEFAULT_LABELS,
  VIDEO_DIMENSIONS,
  VIDEO_FORMAT_DIMENSIONS,
  VIDEO_MERGE_LIMITS,
} from '@genfeedai/constants';
import {
  IngredientFormat,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/enums';
import { z } from 'zod';
/**
 * Schema for individual storyboard frame
 * Each frame has an image reference + prompt that generates a video
 */
export const storyboardFrameSchema = z.object({
  camera: z.string().optional(),
  // Frame-specific settings
  duration: z.number().min(3).max(10),
  // Error message if generation failed
  error: z.string().optional(),
  // Unique frame identifier
  id: z.string().min(1, 'Frame ID is required'),
  // Image reference (optional for video-only storyboard)
  imageId: z.string().optional(),
  imageThumbnailUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  mood: z.string().optional(),
  // Frame order
  order: z.number().int().min(0),
  // Prompt for this specific frame (optional for video-only storyboard)
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters')
    .max(500, 'Prompt must be less than 500 characters')
    .optional(),
  scene: z.string().optional(),
  // Generation status (optional for video-only storyboard)
  status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
  // Optional: Style/mood/camera for this frame
  style: z.string().optional(),
  // Optional: Generated video (populated after generation)
  videoId: z.string().optional(),
  videoThumbnailUrl: z.string().optional(),
  videoUrl: z.string().optional(),
});
/**
 * Schema for the complete storyboard
 */
export const storyboardSchema = z.object({
  camera: z.string().optional(),
  description: z.string().optional(),
  // Global settings (applied to all frames unless overridden)
  format: z.enum([
    IngredientFormat.PORTRAIT,
    IngredientFormat.LANDSCAPE,
    IngredientFormat.SQUARE,
  ]),
  // Array of frames
  frames: z
    .array(storyboardFrameSchema)
    .min(1, 'At least 1 frame is required')
    .max(
      VIDEO_MERGE_LIMITS.MAX_VIDEOS,
      `Maximum ${VIDEO_MERGE_LIMITS.MAX_VIDEOS} frames allowed`,
    ),
  height: z
    .number()
    .min(
      VIDEO_DIMENSIONS.MIN_HEIGHT,
      `Height must be at least ${VIDEO_DIMENSIONS.MIN_HEIGHT}px`,
    )
    .max(
      VIDEO_DIMENSIONS.MAX_HEIGHT,
      `Height must be at most ${VIDEO_DIMENSIONS.MAX_HEIGHT}px`,
    ),
  isBrandingEnabled: z.boolean(),
  // Final video settings
  isCaptionsEnabled: z.boolean(),
  // Audio settings for merged video
  isMuteVideoAudio: z.boolean().optional(),
  // Storyboard metadata
  label: z.string().min(1, 'Label is required'),
  // Optional: Global model to use for all frames
  model: z.string().optional(),
  mood: z.string().optional(),
  // Background music for final merged video
  musicId: z.string().optional(),
  musicVolume: z.number().min(0).max(100).optional(),
  scene: z.string().optional(),
  // Optional: Global style/mood/camera (can be overridden per frame)
  style: z.string().optional(),
  // Transition settings for merged video
  transition: z
    .enum([
      VideoTransition.NONE,
      VideoTransition.FADE,
      VideoTransition.DISSOLVE,
      VideoTransition.WIPELEFT,
      VideoTransition.WIPERIGHT,
      VideoTransition.WIPEUP,
      VideoTransition.WIPEDOWN,
      VideoTransition.CIRCLEOPEN,
      VideoTransition.CIRCLECLOSE,
      VideoTransition.SLIDELEFT,
      VideoTransition.SLIDERIGHT,
    ])
    .optional(),
  transitionDuration: z.number().min(0.1).max(2).optional(),
  transitionEaseCurve: z
    .enum([
      VideoEaseCurve.EASE_IN_OUT_EXPO,
      VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC,
      VideoEaseCurve.EASE_IN_QUART_OUT_QUAD,
      VideoEaseCurve.EASE_IN_OUT_CUBIC,
      VideoEaseCurve.EASE_IN_OUT_SINE,
    ])
    .optional(),
  width: z
    .number()
    .min(
      VIDEO_DIMENSIONS.MIN_WIDTH,
      `Width must be at least ${VIDEO_DIMENSIONS.MIN_WIDTH}px`,
    )
    .max(
      VIDEO_DIMENSIONS.MAX_WIDTH,
      `Width must be at most ${VIDEO_DIMENSIONS.MAX_WIDTH}px`,
    ),
  zoomConfigs: z
    .array(
      z.object({
        endX: z.number().optional(),
        endY: z.number().optional(),
        endZoom: z.number().optional(),
        startX: z.number().optional(),
        startY: z.number().optional(),
        startZoom: z.number().optional(),
      }),
    )
    .optional(),
  // Zoom settings for merged video
  zoomEaseCurve: z
    .enum([
      VideoEaseCurve.EASE_IN_OUT_EXPO,
      VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC,
      VideoEaseCurve.EASE_IN_QUART_OUT_QUAD,
      VideoEaseCurve.EASE_IN_OUT_CUBIC,
      VideoEaseCurve.EASE_IN_OUT_SINE,
    ])
    .optional(),
});
/**
 * Helper to create a new frame with defaults
 */
export function createStoryboardFrame(imageId, imageUrl, order, options = {}) {
  return {
    duration: options.duration || 5,
    id: `frame-${Date.now()}-${order}`,
    imageId,
    imageThumbnailUrl: options.imageThumbnailUrl,
    imageUrl,
    order,
    prompt: options.prompt || '',
    status: 'pending',
  };
}
/**
 * Helper to initialize storyboard with format
 */
export function initializeStoryboard(format) {
  const dimensions = VIDEO_FORMAT_DIMENSIONS[format];
  return {
    format,
    frames: [],
    height: dimensions.height,
    isBrandingEnabled: false,
    isCaptionsEnabled: false,
    isMuteVideoAudio: false,
    label: DEFAULT_LABELS.MERGED_STORYBOARD,
    musicVolume: 50,
    transition: VideoTransition.NONE,
    transitionDuration: 0.5,
    width: dimensions.width,
  };
}
/**
 * Helper to check if all frames are ready for merging
 */
export function canMergeStoryboard(storyboard) {
  return (
    storyboard.frames.length >= VIDEO_MERGE_LIMITS.MIN_VIDEOS &&
    storyboard.frames.every(
      (frame) => frame.status === 'completed' && frame.videoId,
    )
  );
}
/**
 * Helper to get frames that need generation
 */
export function getPendingFrames(storyboard) {
  return storyboard.frames.filter(
    (frame) =>
      frame.status === 'pending' &&
      frame.prompt &&
      frame.prompt.length >= 10 &&
      !frame.videoId,
  );
}
/**
 * Helper to check if generation is in progress
 */
export function isGenerating(storyboard) {
  return storyboard.frames.some((frame) => frame.status === 'generating');
}
//# sourceMappingURL=storyboard-frame.schema.js.map
