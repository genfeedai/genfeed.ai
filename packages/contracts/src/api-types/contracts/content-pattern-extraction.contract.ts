/**
 * Schema-enforced shape of the pattern analyzer's model answer (#4873).
 *
 * Free text only. `patternType` and `templateCategory` are closed enums and
 * left the model's answer in #4868: they are decided by the typed-decision
 * service and never parsed out of a completion, so the analyzer has no label
 * to coerce.
 *
 * The top level is an object rather than an array because a provider's
 * JSON-schema response format must describe an object.
 */

import { z } from 'zod';

export const contentPatternExtractionItemSchema = z.object({
  description: z.string().min(1),
  extractedFormula: z.string().min(1),
  placeholders: z.array(z.string()),
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
