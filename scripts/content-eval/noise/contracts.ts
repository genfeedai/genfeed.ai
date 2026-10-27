/**
 * Noise-aware report section (#5600). Every ladder and harness A/B report
 * states how far its scores can be trusted: a 95% interval per contestant, a
 * paired comparison against the baseline that names no winner inside the noise,
 * and diagnostics for headroom, suspected task or grader defects, errors and
 * judge stability. The analyzer reads scores the run already produced.
 *
 * Imports only leaf modules, never `../contracts`: the report schema embeds
 * this section.
 */

import { z } from 'zod';

export const NOISE_SECTION_VERSION = 'noise-v1';
/** A baseline at or above this mean has no headroom left to measure. */
export const NOISE_SATURATION_THRESHOLD = 0.95;
/** Outputs regraded to measure judge stability when `--repeats` is above 1. */
export const GRADE_TWICE_SAMPLE_SIZE = 6;
/** Void-reason prefix for a generation that stopped at the token limit. */
export const CUT_OFF_VOID_PREFIX = 'generation cut off';

const nullableUnit = z.number().min(0).max(1).nullable();

export const intervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
});
export type Interval = z.infer<typeof intervalSchema>;

/** Mean and 95% interval over cases; the interval is null below two cases. */
export const noiseEstimateSchema = z.object({
  ci95: intervalSchema.nullable(),
  halfWidth: z.number().nonnegative().nullable(),
  mean: z.number().nullable(),
  n: z.number().int().nonnegative(),
  sd: z.number().nonnegative().nullable(),
});
export type NoiseEstimate = z.infer<typeof noiseEstimateSchema>;

export const noiseContestantSchema = z.object({
  caseCount: z.number().int().nonnegative(),
  contestantId: z.string().min(1),
  /** Pooled standard deviation of repeats of the same case; null with one repeat. */
  repeatSd: z.number().nonnegative().nullable(),
  repeats: z.number().int().positive(),
  score: noiseEstimateSchema,
});
export type NoiseContestant = z.infer<typeof noiseContestantSchema>;

export const NOISE_VERDICTS = [
  'challenger-better',
  'baseline-better',
  'within-noise',
  'insufficient-data',
] as const;
export type NoiseVerdict = (typeof NOISE_VERDICTS)[number];

export const noiseComparisonSchema = z.object({
  baselineId: z.string().min(1),
  challengerId: z.string().min(1),
  /** Challenger minus baseline, paired by case. */
  difference: noiseEstimateSchema,
  /** Null inside the noise or without enough data: no winner is named. */
  winnerId: z.string().nullable(),
  verdict: z.enum(NOISE_VERDICTS),
});
export type NoiseComparison = z.infer<typeof noiseComparisonSchema>;

export const noiseErrorsSchema = z.object({
  contestantId: z.string().min(1),
  /** Generations that stopped at the token limit: a budget problem, not quality. */
  cutOffs: z.number().int().nonnegative(),
  generationFailures: z.number().int().nonnegative(),
  judgingFailures: z.number().int().nonnegative(),
  otherVoid: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  timeouts: z.number().int().nonnegative(),
});

export const suspectedDefectSchema = z.object({
  fixtureId: z.string().min(1),
  rows: z.number().int().positive(),
});

export const gradeTwiceSchema = z.object({
  changeRate: nullableUnit,
  sampled: z.number().int().nonnegative(),
  verdictChanges: z.number().int().nonnegative(),
});

export const noiseSectionSchema = z.object({
  comparisons: z.array(noiseComparisonSchema),
  contestants: z.array(noiseContestantSchema),
  diagnostics: z.object({
    alwaysFailingCases: z.array(suspectedDefectSchema),
    errors: z.array(noiseErrorsSchema),
    gradeTwice: gradeTwiceSchema.nullable(),
    isBaselineSaturated: z.boolean(),
    warnings: z.array(z.string()),
  }),
  version: z.literal(NOISE_SECTION_VERSION),
});
export type NoiseSection = z.infer<typeof noiseSectionSchema>;
