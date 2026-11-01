import { z } from 'zod';
import { type DroppedItemsHandler, lenientItems } from './lenient-items';

/** One trend's angle and post idea, keyed by the position the prompt gave it. */
export const trendDigestAngleSchema = z.strictObject({
  angle: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  format: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  index: z.number().int().min(0),
});

/** Same envelope as the strict schema, validating each topic on its own. */
export function createLenientTrendDigestAnglesSchema(
  onDropped?: DroppedItemsHandler,
) {
  return z.strictObject({
    topics: lenientItems(trendDigestAngleSchema, { onDropped }),
  });
}

export type TrendDigestAngle = z.infer<typeof trendDigestAngleSchema>;
export const TREND_DIGEST_ANGLES_SCHEMA_NAME = 'trend_digest_angles';
