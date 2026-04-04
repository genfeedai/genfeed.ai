import {
  DEFAULT_LABELS,
  VIDEO_DIMENSIONS,
  VIDEO_FORMAT_DIMENSIONS,
  VIDEO_MERGE_LIMITS,
} from '@genfeedai/constants';
import { IngredientFormat } from '@genfeedai/enums';
import { z } from 'zod';

const videoFrameSchema = z.object({
  id: z.string().min(1, 'Video ID is required'),
  title: z.string().optional(),
  url: z.string().url('Invalid video URL'),
});

export const videoMergeSchema = z.object({
  description: z.string().optional(),

  format: z.enum([
    IngredientFormat.PORTRAIT,
    IngredientFormat.LANDSCAPE,
    IngredientFormat.SQUARE,
  ]),
  frames: z
    .array(videoFrameSchema)
    .min(
      VIDEO_MERGE_LIMITS.MIN_VIDEOS,
      `At least ${VIDEO_MERGE_LIMITS.MIN_VIDEOS} videos are required for merging`,
    )
    .max(
      VIDEO_MERGE_LIMITS.MAX_VIDEOS,
      `Maximum ${VIDEO_MERGE_LIMITS.MAX_VIDEOS} videos can be merged`,
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

  isCaptionsEnabled: z.boolean(),

  label: z.string().min(1, 'Label is required'),
  music: z.string().optional(),

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
});

export type VideoMergeSchema = z.infer<typeof videoMergeSchema>;

export function convertToFormData(
  videos: Array<{
    id: string;
    url: string;
    thumbnailUrl?: string;
    title?: string;
  }>,
  options: {
    label?: string;
    isCaptionsEnabled?: boolean;
    format?: IngredientFormat;
    music?: string;
  } = {},
): VideoMergeSchema {
  const format = options.format || IngredientFormat.PORTRAIT;
  const dimensions = VIDEO_FORMAT_DIMENSIONS[format];

  return {
    format,
    frames: videos.map((v) => ({
      id: v.id,
      thumbnailUrl: v.thumbnailUrl,
      title: v.title,
      url: v.url,
    })),
    height: dimensions.height,
    isCaptionsEnabled: options.isCaptionsEnabled || false,
    label: options.label || DEFAULT_LABELS.MERGED_STORYBOARD,
    music: options.music || '',
    width: dimensions.width,
  };
}
