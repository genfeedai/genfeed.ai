/**
 * Media perception contract (#4879).
 *
 * Perception turns an asset into persisted text artefacts once, so every later
 * gate (moderation, vision flags, typed text decisions) reads text instead of
 * re-running media analysis:
 *
 * - `frames`      evenly spaced stills sampled by the files service
 * - `ocr`         on-screen text read from those stills by a local OCR engine
 * - `transcript`  speech-to-text of the audio track
 * - `description` a schema-enforced scene description from a vision model
 *
 * Each artefact carries its own status so a partial record is still useful:
 * the vision model being unavailable leaves `description` pending for retry
 * while frames, OCR and transcript are already persisted.
 *
 * Records are keyed by the SHA-256 of the asset bytes. The same bytes are
 * never perceived twice inside an organization — a second ingredient with an
 * identical hash reuses the stored artefacts.
 */

import { z } from 'zod';
import { mediaReadinessKindSchema } from './media-readiness.contract';

/** Bumped when the persisted record shape changes incompatibly. */
export const MEDIA_PERCEPTION_SCHEMA_VERSION = 1;

/** Default number of evenly spaced frames sampled from a video. */
export const MEDIA_PERCEPTION_DEFAULT_FRAME_COUNT = 6;
export const MEDIA_PERCEPTION_MAX_FRAME_COUNT = 24;

const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * - `ready`        the artefact is persisted and usable
 * - `pending`      a retryable failure (provider outage); the retry sweep picks it up
 * - `unavailable`  the artefact cannot exist for this asset or deployment
 *                  (no audio track, no OCR engine installed) — terminal
 * - `failed`       retries were exhausted — terminal
 */
export const mediaPerceptionArtefactStatusValues = [
  'failed',
  'pending',
  'ready',
  'unavailable',
] as const;

export const mediaPerceptionArtefactValues = [
  'description',
  'frames',
  'ocr',
  'transcript',
] as const;

/**
 * Content warnings a scene description may raise. Descriptive, not a verdict:
 * the moderation classifier owns categories and confidences, and the publish
 * gate owns what blocks.
 */
export const mediaContentWarningValues = [
  'alcohol',
  'dangerous_activity',
  'drugs',
  'flashing_lights',
  'gore',
  'hate_symbols',
  'medical',
  'nudity',
  'self_harm',
  'sexual',
  'tobacco',
  'violence',
  'weapons',
] as const;

export const mediaPerceptionArtefactStatusSchema = z.enum(
  mediaPerceptionArtefactStatusValues,
);
export const mediaPerceptionArtefactSchema = z.enum(
  mediaPerceptionArtefactValues,
);
export const mediaContentWarningSchema = z.enum(mediaContentWarningValues);

/**
 * The vision model's answer. Sent to the provider as a JSON Schema and
 * validated with zod on the way back, so a prose-only answer is never
 * persisted.
 */
export const mediaSceneDescriptionSchema = z
  .object({
    brandElements: z.array(z.string().min(1).max(200)).max(20),
    contentWarnings: z
      .array(mediaContentWarningSchema)
      .max(mediaContentWarningValues.length),
    /** The issue text calls these `containsPeople`/`containsMinorsSuspected`;
     * renamed to the repository's `has` boolean convention. */
    hasPeople: z.boolean(),
    hasSuspectedMinors: z.boolean(),
    setting: z.string().max(500),
    subjects: z.array(z.string().min(1).max(200)).max(20),
    summary: z.string().min(1).max(2_000),
    textOnScreen: z.string().max(2_000),
  })
  .strict();

export const MEDIA_SCENE_DESCRIPTION_SCHEMA_NAME = 'media_scene_description';

export const mediaPerceptionFrameSchema = z.object({
  height: z.number().int().positive().nullable(),
  index: z.number().int().nonnegative(),
  storageKey: z.string().min(1).nullable(),
  /** Offset into the source; `null` for a still image. */
  timestampSeconds: z.number().nonnegative().nullable(),
  /** Absolute CDN URL, or a `/local/…` path on the self-hosted disk driver. */
  url: z.string().min(1),
  width: z.number().int().positive().nullable(),
});

export const mediaPerceptionOcrEntrySchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  text: z.string(),
});

export const mediaPerceptionTranscriptSchema = z.object({
  durationSeconds: z.number().nonnegative().nullable(),
  language: z.string().min(1).nullable(),
  text: z.string(),
});

export const mediaPerceptionDiagnosticSchema = z.object({
  artefact: mediaPerceptionArtefactSchema,
  code: z.string().min(1),
  message: z.string().min(1),
});

/** API → files service: hash the bytes behind an asset URL. */
export const mediaPerceptionFingerprintRequestSchema = z.object({
  url: z.url(),
});

/** API → files service: sample frames, OCR them and extract the audio track. */
export const mediaPerceptionArtefactsRequestSchema = z.object({
  /** Hash from the fingerprint call; namespaces the stored frames. */
  assetHash: assetHashSchema,
  frameCount: z.number().int().min(1).max(MEDIA_PERCEPTION_MAX_FRAME_COUNT),
  kind: mediaReadinessKindSchema,
  organizationId: z.string().min(1),
  url: z.url(),
});

/** Files-service fingerprint: identity of the bytes behind an asset URL. */
export const mediaPerceptionFingerprintSchema = z.object({
  assetHash: assetHashSchema,
  sizeBytes: z.number().int().nonnegative(),
});

/**
 * Files-service artefacts: everything perception can produce without a model
 * call. The transcript and description are added by the API.
 */
export const mediaPerceptionArtefactsSchema = z.object({
  assetHash: assetHashSchema,
  /** Extracted audio track to transcribe; `null` when the asset has none. */
  audioUrl: z.string().min(1).nullable(),
  diagnostics: z.array(mediaPerceptionDiagnosticSchema),
  durationSeconds: z.number().nonnegative().nullable(),
  frames: z.array(mediaPerceptionFrameSchema),
  framesStatus: mediaPerceptionArtefactStatusSchema,
  kind: mediaReadinessKindSchema,
  ocr: z.array(mediaPerceptionOcrEntrySchema),
  ocrStatus: mediaPerceptionArtefactStatusSchema,
});

/** The persisted record, as stored for an asset and returned to readers. */
export const mediaPerceptionRecordSchema = z.object({
  assetHash: assetHashSchema,
  description: mediaSceneDescriptionSchema.nullable(),
  descriptionModel: z.string().min(1).nullable(),
  descriptionStatus: mediaPerceptionArtefactStatusSchema,
  diagnostics: z.array(mediaPerceptionDiagnosticSchema),
  durationSeconds: z.number().nonnegative().nullable(),
  frames: z.array(mediaPerceptionFrameSchema),
  framesStatus: mediaPerceptionArtefactStatusSchema,
  kind: mediaReadinessKindSchema,
  ocr: z.array(mediaPerceptionOcrEntrySchema),
  ocrStatus: mediaPerceptionArtefactStatusSchema,
  schemaVersion: z.number().int().positive(),
  transcript: mediaPerceptionTranscriptSchema.nullable(),
  transcriptStatus: mediaPerceptionArtefactStatusSchema,
});

export type MediaPerceptionArtefactStatus = z.infer<
  typeof mediaPerceptionArtefactStatusSchema
>;
export type MediaPerceptionArtefact = z.infer<
  typeof mediaPerceptionArtefactSchema
>;
export type MediaContentWarning = z.infer<typeof mediaContentWarningSchema>;
export type MediaSceneDescription = z.infer<typeof mediaSceneDescriptionSchema>;
export type MediaPerceptionFrame = z.infer<typeof mediaPerceptionFrameSchema>;
export type MediaPerceptionOcrEntry = z.infer<
  typeof mediaPerceptionOcrEntrySchema
>;
export type MediaPerceptionTranscript = z.infer<
  typeof mediaPerceptionTranscriptSchema
>;
export type MediaPerceptionDiagnostic = z.infer<
  typeof mediaPerceptionDiagnosticSchema
>;
export type MediaPerceptionFingerprintRequest = z.infer<
  typeof mediaPerceptionFingerprintRequestSchema
>;
export type MediaPerceptionArtefactsRequest = z.infer<
  typeof mediaPerceptionArtefactsRequestSchema
>;
export type MediaPerceptionFingerprint = z.infer<
  typeof mediaPerceptionFingerprintSchema
>;
export type MediaPerceptionArtefacts = z.infer<
  typeof mediaPerceptionArtefactsSchema
>;
export type MediaPerceptionRecord = z.infer<typeof mediaPerceptionRecordSchema>;
