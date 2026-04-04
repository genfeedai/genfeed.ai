import { IngredientFormat } from '@genfeedai/enums';

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

export const DEFAULT_LABELS = {
  MERGED_STORYBOARD: 'Merged Storyboard',
} as const;
