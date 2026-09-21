/**
 * Schema-enforced shape of the SEO scorer's qualitative layer (#4873).
 *
 * The deterministic checks are computed in code; only these four rubric
 * dimensions and the suggestion prose come from a model. Each band matches the
 * matching check's `max` in `skills/content-seo-optimizer/SKILL.md`.
 */

import { z } from 'zod';

export const seoQualitativeScoringSchema = z.object({
  activeVoicePoints: z.number().min(0).max(3),
  conclusionCtaPoints: z.number().min(0).max(1),
  faqPoints: z.number().min(0).max(3),
  jargonPoints: z.number().min(0).max(2),
  suggestions: z.array(z.string()),
});

export type SeoQualitativeScoring = z.infer<typeof seoQualitativeScoringSchema>;

export const SEO_QUALITATIVE_SCORING_SCHEMA_NAME = 'seo_qualitative_scoring';
