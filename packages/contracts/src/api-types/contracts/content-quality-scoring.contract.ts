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

/**
 * Bounded rubric for visual content (#4881). Enums rather than prose so the
 * flags below are derived deterministically, never parsed from text.
 */
export const visionRubricSchema = z
  .object({
    artifactLevel: z.enum(['none', 'minor', 'severe']),
    brandReadiness: z.enum(['ready', 'needs_polish', 'not_ready']),
    compositionQuality: z.enum(['strong', 'acceptable', 'weak']),
    hookStrength: z.enum(['strong', 'moderate', 'weak']),
  })
  .strict();

export const contentQualityVisionScoringSchema = contentQualityScoringSchema
  .extend({ rubric: visionRubricSchema })
  .strict();

export type VisionRubric = z.infer<typeof visionRubricSchema>;
export type ContentQualityVisionScoring = z.infer<
  typeof contentQualityVisionScoringSchema
>;

export const CONTENT_QUALITY_VISION_SCORING_SCHEMA_NAME =
  'content_quality_vision_scoring';

export const visionFlagReasonValues = [
  'minor_artifacts',
  'needs_brand_polish',
  'not_brand_ready',
  'severe_artifacts',
  'weak_composition',
] as const;
export type VisionFlagReason = (typeof visionFlagReasonValues)[number];

/** Rubric value → flag reason and severity. Unlisted values raise nothing. */
const VISION_FLAG_RULES: ReadonlyArray<{
  matches: (rubric: VisionRubric) => boolean;
  reason: VisionFlagReason;
  severity: 'critical' | 'info' | 'warning';
}> = [
  {
    matches: (rubric) => rubric.artifactLevel === 'severe',
    reason: 'severe_artifacts',
    severity: 'critical',
  },
  {
    matches: (rubric) => rubric.brandReadiness === 'not_ready',
    reason: 'not_brand_ready',
    severity: 'critical',
  },
  {
    matches: (rubric) => rubric.compositionQuality === 'weak',
    reason: 'weak_composition',
    severity: 'warning',
  },
  {
    matches: (rubric) => rubric.artifactLevel === 'minor',
    reason: 'minor_artifacts',
    severity: 'info',
  },
  {
    matches: (rubric) => rubric.brandReadiness === 'needs_polish',
    reason: 'needs_brand_polish',
    severity: 'info',
  },
];

const SEVERITY_RANK = { critical: 2, info: 0, warning: 1 } as const;

/**
 * Typed flags from the rubric. `isFlagged` is true for any `warning` or
 * `critical` reason; `info` reasons are recorded but never flag.
 */
export function deriveVisionFlags(rubric: VisionRubric): {
  isFlagged: boolean;
  reasons: VisionFlagReason[];
  severity: 'critical' | 'info' | 'warning';
} {
  const matched = VISION_FLAG_RULES.filter((rule) => rule.matches(rubric));
  const severity = matched.reduce<'critical' | 'info' | 'warning'>(
    (worst, rule) =>
      SEVERITY_RANK[rule.severity] > SEVERITY_RANK[worst]
        ? rule.severity
        : worst,
    'info',
  );
  return {
    isFlagged: severity !== 'info',
    reasons: matched.map((rule) => rule.reason),
    severity,
  };
}
