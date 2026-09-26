/**
 * Text decisions on perception output (#4882).
 *
 * Once an asset has a transcript, on-screen text and a scene description, the
 * typed text decisions of epic #4863 apply to video and audio too. Three
 * boolean questions, each answered with a calibrated confidence:
 *
 * - `isBrandSafe`         no slurs, harassment, regulated or unsafe claims
 * - `isOnBrand`           fits the brand's voice and positioning
 * - `isCaptionConsistent` the post caption matches what the media shows
 *
 * A confident `false` on the first two forces review in `live`; caption
 * inconsistency is only ever a warning. The question set is exported so the
 * text pre-publish gate (#4871) can ask the same questions of captions.
 */

import { z } from 'zod';
import { mediaGateModeSchema } from './media-moderation.contract';

export const mediaTextDecisionNameValues = [
  'isBrandSafe',
  'isCaptionConsistent',
  'isOnBrand',
] as const;
export const mediaTextDecisionNameSchema = z.enum(mediaTextDecisionNameValues);
export type MediaTextDecisionName = z.infer<typeof mediaTextDecisionNameSchema>;

/** Stable telemetry keys, one per question. */
export const MEDIA_TEXT_DECISION_POINTS: Readonly<
  Record<MediaTextDecisionName, string>
> = {
  isBrandSafe: 'media_text.is_brand_safe',
  isCaptionConsistent: 'media_text.is_caption_consistent',
  isOnBrand: 'media_text.is_on_brand',
};

export const MEDIA_TEXT_DECISION_QUESTIONS: Readonly<
  Record<MediaTextDecisionName, string>
> = {
  isBrandSafe:
    'Is this content brand-safe to publish: free of slurs, harassment, hate, graphic or sexual content, dangerous instructions, and unverifiable medical, financial or legal claims?',
  isCaptionConsistent:
    'Does the post caption accurately describe what the media shows, without claiming people, products, places or events that are not in it?',
  isOnBrand:
    "Does this content fit the brand's described voice, audience and positioning?",
};

/** Where the judged text came from, for the reason shown to a reviewer. */
export const mediaTextDecisionSourceValues = [
  'description',
  'transcript',
] as const;
export const mediaTextDecisionSourceSchema = z.enum(
  mediaTextDecisionSourceValues,
);

export const mediaTextDecisionSchema = z.object({
  confidence: z.number().min(0).max(1),
  name: mediaTextDecisionNameSchema,
  source: mediaTextDecisionSourceSchema,
  value: z.boolean(),
});

/** Subject of a record: the asset itself, or one caption it is posted with. */
export const MEDIA_TEXT_ASSET_SUBJECT = 'asset';

export const mediaTextDecisionRecordSchema = z.object({
  assetHash: z.string().regex(/^[a-f0-9]{64}$/),
  decisions: z.array(mediaTextDecisionSchema),
  mode: mediaGateModeSchema,
  /** `asset`, or `caption:<sha256 of the trimmed caption>`. */
  subjectKey: z.string().min(1),
});

export type MediaTextDecisionSource = z.infer<
  typeof mediaTextDecisionSourceSchema
>;
export type MediaTextDecision = z.infer<typeof mediaTextDecisionSchema>;
export type MediaTextDecisionRecord = z.infer<
  typeof mediaTextDecisionRecordSchema
>;
