import { z } from 'zod';
import { type DroppedItemsHandler, lenientItems } from './lenient-items';

export const trendContentIdeaSchema = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  contentType: z.enum(['video', 'image', 'carousel', 'thread', 'text']),
  hashtags: z.array(z.string().trim().min(1)).nullish(),
  caption: z.string().trim().min(1).nullish(),
  estimatedViews: z.number().finite().min(0).nullish(),
});
export const trendContentIdeasSchema = z.strictObject({
  ideas: z.array(trendContentIdeaSchema),
});

/** Same envelope as {@link trendContentIdeasSchema}, validating each idea on its own. */
export function createLenientTrendContentIdeasSchema(
  onDropped?: DroppedItemsHandler,
) {
  return z.strictObject({
    ideas: lenientItems(trendContentIdeaSchema, { onDropped }),
  });
}
export type TrendContentIdea = z.infer<typeof trendContentIdeaSchema>;
export const TREND_CONTENT_IDEAS_SCHEMA_NAME = 'trend_content_ideas';
