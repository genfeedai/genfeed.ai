import { z } from 'zod';
import { type DroppedItemsHandler, lenientItems } from './lenient-items';

export const clipHighlightSchema = z
  .strictObject({
    start_time: z.number().finite().min(0),
    end_time: z.number().finite().min(0),
    title: z.string().trim().min(1).max(60),
    summary: z.string().trim().min(1),
    virality_score: z.number().finite().min(1).max(100),
    tags: z.array(z.string().trim().min(1)),
    clip_type: z.enum([
      'hook',
      'story',
      'tutorial',
      'reaction',
      'quote',
      'controversial',
      'educational',
    ]),
  })
  .refine(
    (clip) =>
      clip.end_time - clip.start_time >= 15 &&
      clip.end_time - clip.start_time <= 90,
    {
      message: 'Clip duration must be between 15 and 90 seconds',
      path: ['end_time'],
    },
  );
export const clipHighlightDetectionSchema = z.strictObject({
  highlights: z.array(clipHighlightSchema),
});

const MAX_CLIP_TITLE_LENGTH = 60;

function truncateClipTitle(item: unknown): unknown {
  if (
    typeof item === 'object' &&
    item !== null &&
    'title' in item &&
    typeof item.title === 'string'
  ) {
    return {
      ...item,
      title: item.title.trim().slice(0, MAX_CLIP_TITLE_LENGTH).trim(),
    };
  }
  return item;
}

/**
 * Same envelope as {@link clipHighlightDetectionSchema}, but each clip is
 * validated on its own: over-long titles are truncated, clips outside the
 * duration bounds (or otherwise invalid) are dropped and reported.
 */
export function createLenientClipHighlightDetectionSchema(
  onDropped?: DroppedItemsHandler,
) {
  return z.strictObject({
    highlights: lenientItems(clipHighlightSchema, {
      normalize: truncateClipTitle,
      onDropped,
    }),
  });
}
export type HighlightResult = z.infer<typeof clipHighlightSchema>;
export const CLIP_HIGHLIGHT_DETECTION_SCHEMA_NAME = 'clip_highlight_detection';
