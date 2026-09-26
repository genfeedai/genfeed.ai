/**
 * Media assessment (#4881): the per-post summary every media gate feeds into
 * the publish policy.
 *
 * Sources, in order of cost:
 * - `readiness`   deterministic platform media spec (#4878) — always on
 * - `moderation`  the classifier verdict (#4880) — flags only in `live`
 * - `vision`      typed vision-evaluation flags (#4881) — flags only in `live`
 * - `transcript` / `description`  text decisions on perception output (#4882)
 *
 * An assessment can only tighten a publish decision: `isBlocking` turns an
 * auto-publish into review-required, and nothing here can turn a denial into
 * a publish. A gate that is `live` but has not produced a result for an asset
 * yet blocks too (source `perception`): unchecked media is never treated as
 * clean.
 */

import { z } from 'zod';

export const mediaAssessmentSourceValues = [
  'description',
  'moderation',
  'perception',
  'readiness',
  'transcript',
  'vision',
] as const;
export const mediaAssessmentSourceSchema = z.enum(mediaAssessmentSourceValues);

export const mediaAssessmentReasonSchema = z.object({
  assetId: z.string().min(1),
  /** Stable machine code, e.g. `moderation:violence`, `vision:severe_artifacts`. */
  code: z.string().min(1),
  /** One line a reviewer reads on the publish card. */
  message: z.string().min(1),
  source: mediaAssessmentSourceSchema,
});

export const mediaAssessmentSchema = z.object({
  /** Any reason here forces review; warnings never do. */
  isBlocking: z.boolean(),
  /** Some attached asset has not finished perception; its gates could not run. */
  isPerceptionPending: z.boolean(),
  reasons: z.array(mediaAssessmentReasonSchema),
  warnings: z.array(mediaAssessmentReasonSchema),
});

export type MediaAssessmentSource = z.infer<typeof mediaAssessmentSourceSchema>;
export type MediaAssessmentReason = z.infer<typeof mediaAssessmentReasonSchema>;
export type MediaAssessment = z.infer<typeof mediaAssessmentSchema>;
