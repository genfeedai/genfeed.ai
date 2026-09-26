/**
 * Media moderation contract (#4880).
 *
 * A provider adapter scores each moderation input — the original image, every
 * sampled video frame, the transcript and the on-screen (OCR) text — per
 * Genfeed {@link ModerationCategory}. The verdict is the maximum over inputs:
 * a category is flagged when any input reaches that category's threshold.
 *
 * Gate modes are shared by every media gate in epic #4877:
 * - `off`     nothing is classified
 * - `shadow`  classified and persisted, but the verdict is never flagged; the
 *             would-have-flagged result is kept for the shadow report
 * - `live`    the verdict is flagged and downstream gates act on it
 */

import { z } from 'zod';
import { ModerationCategory } from '../../enums/moderation-category.enum';

export const mediaGateModeValues = ['live', 'off', 'shadow'] as const;
export const mediaGateModeSchema = z.enum(mediaGateModeValues);
export type MediaGateMode = z.infer<typeof mediaGateModeSchema>;

export const moderationCategorySchema = z.enum(ModerationCategory);

/** Where a moderated input came from. */
export const moderationInputSourceValues = [
  'frame',
  'image',
  'ocr',
  'transcript',
] as const;
export const moderationInputSourceSchema = z.enum(moderationInputSourceValues);

const confidenceSchema = z.number().min(0).max(1);

/** Confidence per category; categories a provider cannot score are absent. */
export const moderationScoresSchema = z.partialRecord(
  moderationCategorySchema,
  confidenceSchema,
);

/** One classified input and its scores, kept for the review UI. */
export const moderationInputResultSchema = z.object({
  /** Index into the perception frames for `frame` inputs, else `null`. */
  frameIndex: z.number().int().nonnegative().nullable(),
  scores: moderationScoresSchema,
  source: moderationInputSourceSchema,
});

/** A category that crossed its threshold on a specific input. */
export const moderationTriggerSchema = z.object({
  category: moderationCategorySchema,
  confidence: confidenceSchema,
  frameIndex: z.number().int().nonnegative().nullable(),
  source: moderationInputSourceSchema,
  threshold: confidenceSchema,
});

export const moderationVerdictSchema = z.object({
  flaggedCategories: z.array(moderationCategorySchema),
  isFlagged: z.boolean(),
  /** Highest confidence over every input and category. */
  maxConfidence: confidenceSchema,
  triggers: z.array(moderationTriggerSchema),
});

/** Per-category thresholds; a category absent here uses its default. */
export const moderationThresholdsSchema = z.partialRecord(
  moderationCategorySchema,
  confidenceSchema,
);

/**
 * Default thresholds. Deliberately strict for minors and self-harm, lenient
 * for spam. #4883 recalibrates these from the labelled benchmark before any
 * `live` flip; until then they are starting points, not evidence.
 */
export const DEFAULT_MODERATION_THRESHOLDS: Readonly<
  Record<ModerationCategory, number>
> = {
  [ModerationCategory.DRUGS]: 0.7,
  [ModerationCategory.GRAPHIC]: 0.6,
  [ModerationCategory.HARASSMENT]: 0.6,
  [ModerationCategory.HATE]: 0.5,
  [ModerationCategory.SELF_HARM]: 0.4,
  [ModerationCategory.SEXUAL]: 0.5,
  [ModerationCategory.SEXUAL_MINORS]: 0.2,
  [ModerationCategory.SPAM]: 0.9,
  [ModerationCategory.VIOLENCE]: 0.7,
  [ModerationCategory.WEAPONS]: 0.7,
};

/** The persisted moderation record for one asset. */
export const mediaModerationRecordSchema = z.object({
  assetHash: z.string().regex(/^[a-f0-9]{64}$/),
  /**
   * What the thresholds say, regardless of mode. Equal to `verdict` in
   * `live`; in `shadow` this is the would-have-flagged result.
   */
  candidateVerdict: moderationVerdictSchema,
  inputs: z.array(moderationInputResultSchema),
  mode: mediaGateModeSchema,
  provider: z.string().min(1),
  thresholds: moderationThresholdsSchema,
  /** The verdict gates act on. Never flagged in `shadow`. */
  verdict: moderationVerdictSchema,
});

export type ModerationInputSource = z.infer<typeof moderationInputSourceSchema>;
export type ModerationScores = z.infer<typeof moderationScoresSchema>;
export type ModerationInputResult = z.infer<typeof moderationInputResultSchema>;
export type ModerationTrigger = z.infer<typeof moderationTriggerSchema>;
export type ModerationVerdict = z.infer<typeof moderationVerdictSchema>;
export type ModerationThresholds = z.infer<typeof moderationThresholdsSchema>;
export type MediaModerationRecord = z.infer<typeof mediaModerationRecordSchema>;
