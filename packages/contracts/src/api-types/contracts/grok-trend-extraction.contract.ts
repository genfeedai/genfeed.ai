/**
 * Schema-enforced shape of Grok's real-time trend extraction (#4873).
 *
 * Wrapped in an object because a provider's JSON-schema response format must
 * describe an object, not a bare array. `mentions` is the model's own estimate
 * and `growthRate` a 0-100 band, both previously clamped after the fact.
 */

import { z } from 'zod';

export const grokTrendSchema = z.object({
  contentAngle: z.string().min(1),
  context: z.string().min(1),
  growthRate: z.number().min(0).max(100),
  hashtags: z.array(z.string()),
  mentions: z.number().min(0),
  topic: z.string().min(1),
});

export const grokTrendExtractionSchema = z.object({
  trends: z.array(grokTrendSchema),
});

export type GrokTrendExtraction = z.infer<typeof grokTrendExtractionSchema>;

export const GROK_TREND_EXTRACTION_SCHEMA_NAME = 'grok_trend_extraction';
