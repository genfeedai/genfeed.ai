/**
 * Per-platform media readiness API contract.
 *
 * Declares the asset-level properties a platform accepts (dimensions, aspect
 * ratio, duration, file size, container, codecs, frame rate) and the
 * diagnostic shape produced when an attached asset violates one of them.
 *
 * This is the asset counterpart of `publishing-readiness.contract.ts`, which
 * covers provider *setup* state. Severity is shared with that contract on
 * purpose: a publish path treats `error` the same way regardless of whether
 * the credential or the asset is at fault.
 *
 * Evaluation is deterministic — no provider call, no model call. Whether a
 * property blocks or merely warns is data on the spec entry
 * (`severities` / `defaultSeverity`), never a branch in the evaluator.
 *
 * Foundation for issue #4878.
 */

import { z } from 'zod';
import { CredentialPlatform } from '../..';
import { publishingDiagnosticSeveritySchema } from './publishing-readiness.contract';

export const mediaReadinessKindValues = ['audio', 'image', 'video'] as const;

/**
 * Asset properties a spec can constrain, plus two meta-properties: `probe`,
 * raised when a property the spec constrains has no measured value, and
 * `asset`, raised when an attached asset id does not resolve inside the
 * organization at all.
 */
export const mediaReadinessPropertyValues = [
  'aspectRatio',
  'asset',
  'audioCodec',
  'container',
  'duration',
  'fileSize',
  'frameRate',
  'height',
  'probe',
  'videoCodec',
  'width',
] as const;

export const mediaReadinessKindSchema = z.enum(mediaReadinessKindValues);
export const mediaReadinessPropertySchema = z.enum(
  mediaReadinessPropertyValues,
);

/** An accepted aspect ratio, expressed as the width:height pair it renders at. */
export const mediaAspectRatioSchema = z.object({
  height: z.number().positive(),
  label: z.string().min(1),
  width: z.number().positive(),
});

/**
 * Per-property severity overrides. A property left unset falls back to the
 * spec entry's `defaultSeverity`, so a seed entry only names the properties
 * that deviate from its default.
 *
 * `asset` is deliberately absent: an attached id that does not resolve inside
 * the organization is a request-integrity failure, not a platform limit, so no
 * spec entry may soften it.
 */
export const mediaReadinessSeverityOverridesSchema = z
  .object({
    aspectRatio: publishingDiagnosticSeveritySchema,
    audioCodec: publishingDiagnosticSeveritySchema,
    container: publishingDiagnosticSeveritySchema,
    duration: publishingDiagnosticSeveritySchema,
    fileSize: publishingDiagnosticSeveritySchema,
    frameRate: publishingDiagnosticSeveritySchema,
    height: publishingDiagnosticSeveritySchema,
    probe: publishingDiagnosticSeveritySchema,
    videoCodec: publishingDiagnosticSeveritySchema,
    width: publishingDiagnosticSeveritySchema,
  })
  .partial();

export const platformMediaSpecSchema = z.object({
  /** Accepted aspect ratios. Empty means the platform does not constrain it. */
  aspectRatios: z.array(mediaAspectRatioSchema),
  /**
   * Allowed relative deviation from the nearest accepted ratio, as a fraction
   * (`0.02` = 2%). Providers publish ranges rather than exact ratios, so an
   * asset within tolerance of any entry passes.
   */
  aspectRatioTolerance: z.number().min(0).max(1),
  /** Accepted audio codec names, lowercase as ffprobe reports them. */
  audioCodecs: z.array(z.string().min(1)),
  /** Accepted container names, lowercase as ffprobe reports them. */
  containers: z.array(z.string().min(1)),
  /** Severity used for any property without an explicit override. */
  defaultSeverity: publishingDiagnosticSeveritySchema,
  /** Provider documentation page the limits below were transcribed from. */
  documentationUrl: z.string().url(),
  kind: mediaReadinessKindSchema,
  maxDurationSeconds: z.number().positive().optional(),
  maxFileSizeBytes: z.number().int().positive().optional(),
  maxFrameRate: z.number().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  maxWidth: z.number().int().positive().optional(),
  minDurationSeconds: z.number().positive().optional(),
  /** Providers that reject a too-small upload document a floor as well. */
  minFileSizeBytes: z.number().int().positive().optional(),
  minFrameRate: z.number().positive().optional(),
  minHeight: z.number().int().positive().optional(),
  minWidth: z.number().int().positive().optional(),
  platform: z.nativeEnum(CredentialPlatform),
  severities: mediaReadinessSeverityOverridesSchema,
  /** ISO date the entry was last checked against `documentationUrl`. */
  sourcedAt: z.iso.date(),
  /** Accepted video codec names, lowercase as ffprobe reports them. */
  videoCodecs: z.array(z.string().min(1)),
});

/**
 * Probe metadata persisted on an asset. Populated once from the files service
 * and reused by every later readiness evaluation.
 */
export const mediaProbeSchema = z.object({
  audioCodec: z.string().min(1).nullable(),
  container: z.string().min(1).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  frameRate: z.number().positive().nullable(),
  height: z.number().int().positive().nullable(),
  kind: mediaReadinessKindSchema,
  probedAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  videoCodec: z.string().min(1).nullable(),
  width: z.number().int().positive().nullable(),
});

export const mediaReadinessDiagnosticSchema = z.object({
  /** The asset's measured value, rendered for display. */
  actual: z.string().min(1),
  assetId: z.string().min(1),
  code: z.string().min(1),
  /** Null when the asset could not be resolved, so its kind is unknown. */
  kind: mediaReadinessKindSchema.nullable(),
  /** The platform limit that was violated, rendered for display. */
  limit: z.string().min(1),
  message: z.string().min(1),
  platform: z.nativeEnum(CredentialPlatform),
  property: mediaReadinessPropertySchema,
  severity: publishingDiagnosticSeveritySchema,
});

export const mediaReadinessReportSchema = z.object({
  checkedAt: z.string().datetime(),
  diagnostics: z.array(mediaReadinessDiagnosticSchema),
  /** True when at least one diagnostic has `error` severity. */
  isBlocked: z.boolean(),
});

export type MediaReadinessKind = z.infer<typeof mediaReadinessKindSchema>;
export type MediaReadinessProperty = z.infer<
  typeof mediaReadinessPropertySchema
>;
export type MediaAspectRatio = z.infer<typeof mediaAspectRatioSchema>;
export type MediaReadinessSeverityOverrides = z.infer<
  typeof mediaReadinessSeverityOverridesSchema
>;
/**
 * The properties a spec entry governs — every `MediaReadinessProperty` whose
 * severity a seed entry can set. `asset` is excluded by design; see
 * `mediaReadinessSeverityOverridesSchema`.
 */
export type MediaReadinessSpecProperty = keyof MediaReadinessSeverityOverrides;
export type PlatformMediaSpec = z.infer<typeof platformMediaSpecSchema>;
export type MediaProbe = z.infer<typeof mediaProbeSchema>;
export type MediaReadinessDiagnostic = z.infer<
  typeof mediaReadinessDiagnosticSchema
>;
export type MediaReadinessReport = z.infer<typeof mediaReadinessReportSchema>;
