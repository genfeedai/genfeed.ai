/**
 * Schema-enforced shape of the content-quality scorer's model answer (#4873).
 *
 * The score is the product rubric's 1-10 band; feedback and suggestions are
 * prose the reviewer reads, which is why this path keeps an LLM rather than a
 * typed decision.
 */

import { z } from 'zod';

export const contentQualityScoringSchema = z.object({
  feedback: z.array(z.string()),
  score: z.number().min(1).max(10),
  suggestions: z.array(z.string()),
});

export type ContentQualityScoring = z.infer<typeof contentQualityScoringSchema>;

export const CONTENT_QUALITY_SCORING_SCHEMA_NAME = 'content_quality_scoring';
