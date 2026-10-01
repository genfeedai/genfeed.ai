import { z } from 'zod';

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
export type HighlightResult = z.infer<typeof clipHighlightSchema>;
export const CLIP_HIGHLIGHT_DETECTION_SCHEMA_NAME = 'clip_highlight_detection';
