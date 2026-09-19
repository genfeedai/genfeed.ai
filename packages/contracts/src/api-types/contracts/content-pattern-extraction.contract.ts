/**
 * Schema-enforced shape of the pattern analyzer's model answer (#4873).
 *
 * `patternType` and `templateCategory` are deliberately free strings here:
 * they are the two enum labels a sibling issue in epic #4863 moves onto a
 * typed decision, so the analyzer keeps its own coercion for now and only the
 * free-text parts — formula, description, placeholders — are schema-enforced.
 *
 * The top level is an object rather than an array because a provider's
 * JSON-schema response format must describe an object.
 */

import { z } from 'zod';

export const contentPatternExtractionItemSchema = z.object({
  description: z.string().min(1),
  extractedFormula: z.string().min(1),
  patternType: z.string().min(1),
  placeholders: z.array(z.string()),
  templateCategory: z.string().nullish(),
});

export const contentPatternExtractionSchema = z.object({
  patterns: z.array(contentPatternExtractionItemSchema),
});

export type ContentPatternExtractionItem = z.infer<
  typeof contentPatternExtractionItemSchema
>;
export type ContentPatternExtraction = z.infer<
  typeof contentPatternExtractionSchema
>;

export const CONTENT_PATTERN_EXTRACTION_SCHEMA_NAME =
  'content_pattern_extraction';
