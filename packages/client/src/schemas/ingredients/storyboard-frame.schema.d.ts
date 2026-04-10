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
export declare const storyboardFrameSchema: z.ZodObject<
  {
    camera: z.ZodOptional<z.ZodString>;
    duration: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    imageId: z.ZodOptional<z.ZodString>;
    imageThumbnailUrl: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
    mood: z.ZodOptional<z.ZodString>;
    order: z.ZodNumber;
    prompt: z.ZodOptional<z.ZodString>;
    scene: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<
      z.ZodEnum<{
        pending: 'pending';
        generating: 'generating';
        completed: 'completed';
        failed: 'failed';
      }>
    >;
    style: z.ZodOptional<z.ZodString>;
    videoId: z.ZodOptional<z.ZodString>;
    videoThumbnailUrl: z.ZodOptional<z.ZodString>;
    videoUrl: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type StoryboardFrame = z.infer<typeof storyboardFrameSchema>;
/**
 * Schema for the complete storyboard
 */
export declare const storyboardSchema: z.ZodObject<
  {
    camera: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    format: z.ZodEnum<{
      landscape: IngredientFormat.LANDSCAPE;
      portrait: IngredientFormat.PORTRAIT;
      square: IngredientFormat.SQUARE;
    }>;
    frames: z.ZodArray<
      z.ZodObject<
        {
          camera: z.ZodOptional<z.ZodString>;
          duration: z.ZodNumber;
          error: z.ZodOptional<z.ZodString>;
          id: z.ZodString;
          imageId: z.ZodOptional<z.ZodString>;
          imageThumbnailUrl: z.ZodOptional<z.ZodString>;
          imageUrl: z.ZodOptional<z.ZodString>;
          mood: z.ZodOptional<z.ZodString>;
          order: z.ZodNumber;
          prompt: z.ZodOptional<z.ZodString>;
          scene: z.ZodOptional<z.ZodString>;
          status: z.ZodOptional<
            z.ZodEnum<{
              pending: 'pending';
              generating: 'generating';
              completed: 'completed';
              failed: 'failed';
            }>
          >;
          style: z.ZodOptional<z.ZodString>;
          videoId: z.ZodOptional<z.ZodString>;
          videoThumbnailUrl: z.ZodOptional<z.ZodString>;
          videoUrl: z.ZodOptional<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    height: z.ZodNumber;
    isBrandingEnabled: z.ZodBoolean;
    isCaptionsEnabled: z.ZodBoolean;
    isMuteVideoAudio: z.ZodOptional<z.ZodBoolean>;
    label: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
    mood: z.ZodOptional<z.ZodString>;
    musicId: z.ZodOptional<z.ZodString>;
    musicVolume: z.ZodOptional<z.ZodNumber>;
    scene: z.ZodOptional<z.ZodString>;
    style: z.ZodOptional<z.ZodString>;
    transition: z.ZodOptional<
      z.ZodEnum<{
        none: VideoTransition.NONE;
        fade: VideoTransition.FADE;
        dissolve: VideoTransition.DISSOLVE;
        wipeleft: VideoTransition.WIPELEFT;
        wiperight: VideoTransition.WIPERIGHT;
        wipeup: VideoTransition.WIPEUP;
        wipedown: VideoTransition.WIPEDOWN;
        circleopen: VideoTransition.CIRCLEOPEN;
        circleclose: VideoTransition.CIRCLECLOSE;
        slideleft: VideoTransition.SLIDELEFT;
        slideright: VideoTransition.SLIDERIGHT;
      }>
    >;
    transitionDuration: z.ZodOptional<z.ZodNumber>;
    transitionEaseCurve: z.ZodOptional<
      z.ZodEnum<{
        easyinoutexpo: VideoEaseCurve.EASE_IN_OUT_EXPO;
        easyinexpooutcubic: VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC;
        easyinquartoutquad: VideoEaseCurve.EASE_IN_QUART_OUT_QUAD;
        easyinoutcubic: VideoEaseCurve.EASE_IN_OUT_CUBIC;
        easyinoutsine: VideoEaseCurve.EASE_IN_OUT_SINE;
      }>
    >;
    width: z.ZodNumber;
    zoomConfigs: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            endX: z.ZodOptional<z.ZodNumber>;
            endY: z.ZodOptional<z.ZodNumber>;
            endZoom: z.ZodOptional<z.ZodNumber>;
            startX: z.ZodOptional<z.ZodNumber>;
            startY: z.ZodOptional<z.ZodNumber>;
            startZoom: z.ZodOptional<z.ZodNumber>;
          },
          z.core.$strip
        >
      >
    >;
    zoomEaseCurve: z.ZodOptional<
      z.ZodEnum<{
        easyinoutexpo: VideoEaseCurve.EASE_IN_OUT_EXPO;
        easyinexpooutcubic: VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC;
        easyinquartoutquad: VideoEaseCurve.EASE_IN_QUART_OUT_QUAD;
        easyinoutcubic: VideoEaseCurve.EASE_IN_OUT_CUBIC;
        easyinoutsine: VideoEaseCurve.EASE_IN_OUT_SINE;
      }>
    >;
  },
  z.core.$strip
>;
export type Storyboard = z.infer<typeof storyboardSchema>;
/**
 * Helper to create a new frame with defaults
 */
export declare function createStoryboardFrame(
  imageId: string,
  imageUrl: string,
  order: number,
  options?: {
    prompt?: string;
    duration?: number;
    imageThumbnailUrl?: string;
  },
): StoryboardFrame;
/**
 * Helper to initialize storyboard with format
 */
export declare function initializeStoryboard(
  format: IngredientFormat,
): Storyboard;
/**
 * Helper to check if all frames are ready for merging
 */
export declare function canMergeStoryboard(storyboard: Storyboard): boolean;
/**
 * Helper to get frames that need generation
 */
export declare function getPendingFrames(
  storyboard: Storyboard,
): StoryboardFrame[];
/**
 * Helper to check if generation is in progress
 */
export declare function isGenerating(storyboard: Storyboard): boolean;
//# sourceMappingURL=storyboard-frame.schema.d.ts.map
