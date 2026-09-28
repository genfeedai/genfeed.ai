import { IngredientFormat } from '..';

export const VIDEO_DIMENSIONS = {
  MAX_HEIGHT: 1920,
  MAX_WIDTH: 1920,
  MIN_HEIGHT: 720,
  MIN_WIDTH: 720,
} as const;

export const VIDEO_FORMAT_DIMENSIONS = {
  [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
  [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
  [IngredientFormat.SQUARE]: { height: 1080, width: 1080 },
} as const;

export const VIDEO_MERGE_LIMITS = {
  MAX_VIDEOS: 10,
  MIN_VIDEOS: 2,
} as const;

/**
 * Server-side bounds shared by every stitch caller. MAX_CLIPS is the largest
 * sequence a caller already produces: 50 interpolation pairs plus the loop
 * pair. The hand-picked merge UI keeps its own lower VIDEO_MERGE_LIMITS.
 */
export const VIDEO_STITCH_LIMITS = {
  MAX_CLIPS: 51,
  MAX_MUSIC_VOLUME: 100,
  MAX_TRANSITION_DURATION: 2,
  MIN_CLIPS: 2,
  MIN_MUSIC_VOLUME: 0,
  MIN_TRANSITION_DURATION: 0.1,
} as const;

export const CLIP_REFERENCE_FRAME_MAX_CANDIDATES = 5;
/** Minimum source duration accepted when a Library asset starts a clip project. */
export const CLIP_SOURCE_MIN_DURATION_SECONDS = 15;
/** Maximum source duration accepted by clip ingestion and materialization. */
export const CLIP_SOURCE_MAX_DURATION_SECONDS = 6 * 60 * 60;
/** Supports materializing multi-hour clip sources before downstream processing. */
export const YT_DLP_PROCESS_TIMEOUT_MS = 30 * 60_000;
export const CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS =
  YT_DLP_PROCESS_TIMEOUT_MS + 60_000;
/** Allows deterministic extraction jobs to process multi-hour source media. */
export const CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS = 45 * 60_000;

export const DEFAULT_LABELS = {
  MERGED_STORYBOARD: 'Merged Storyboard',
} as const;
