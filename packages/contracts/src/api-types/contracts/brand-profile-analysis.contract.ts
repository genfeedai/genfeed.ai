/**
 * Schema-enforced shapes of the brand tone/style profile paths (#4873).
 *
 * Tone analysis returns a score plus prose the reviewer reads, so it keeps an
 * LLM. The per-content-type profile sections stay open records on purpose:
 * their keys are the creative vocabulary each surface renders (palette,
 * pacing, reading level…), and pinning them here would freeze a vocabulary
 * that is not otherwise versioned. What the schema does enforce is that the
 * answer names content types at all, and that each section is an object
 * rather than a sentence.
 */

import { z } from 'zod';

export const brandProfileViolationSeverityValues = [
  'high',
  'medium',
  'low',
] as const;

export const brandToneAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1),
  violations: z.array(
    z.object({
      category: z.string().min(1),
      message: z.string().min(1),
      severity: z.enum(brandProfileViolationSeverityValues),
      suggestion: z.string().min(1),
    }),
  ),
});

/**
 * Present but `null` for a content type the examples do not cover. Allowing
 * the key to be omitted would let `{}` validate, and `analyzeExamples` would
 * return four undefined sections as if the model had answered.
 */
const profileSectionSchema = z.record(z.string(), z.unknown()).nullable();

export const brandProfileAnalysisSchema = z.object({
  article: profileSectionSchema,
  image: profileSectionSchema,
  video: profileSectionSchema,
  voice: profileSectionSchema,
});

export type BrandToneAnalysis = z.infer<typeof brandToneAnalysisSchema>;
export type BrandProfileAnalysis = z.infer<typeof brandProfileAnalysisSchema>;

export const BRAND_TONE_ANALYSIS_SCHEMA_NAME = 'brand_tone_analysis';
export const BRAND_PROFILE_ANALYSIS_SCHEMA_NAME = 'brand_profile_analysis';
