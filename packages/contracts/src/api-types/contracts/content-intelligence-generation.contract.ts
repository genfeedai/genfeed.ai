/**
 * Schema-enforced shapes of the content-intelligence generator (#4873).
 *
 * The pattern path fills a proven formula and reports the parts it used;
 * the freeform path returns N independent variations. Both used to be
 * `JSON.parse` of fenced text, with the whole raw completion silently
 * becoming "the content" when parsing failed.
 */

import { z } from 'zod';

export const contentIntelligencePostSchema = z.object({
  body: z.string().nullish(),
  content: z.string().min(1),
  cta: z.string().nullish(),
  hook: z.string().nullish(),
});

export const contentIntelligenceVariationsSchema = z.object({
  variations: z.array(z.object({ content: z.string().min(1) })).min(1),
});

export type ContentIntelligencePost = z.infer<
  typeof contentIntelligencePostSchema
>;
export type ContentIntelligenceVariations = z.infer<
  typeof contentIntelligenceVariationsSchema
>;

export const CONTENT_INTELLIGENCE_POST_SCHEMA_NAME =
  'content_intelligence_post';
export const CONTENT_INTELLIGENCE_VARIATIONS_SCHEMA_NAME =
  'content_intelligence_variations';
