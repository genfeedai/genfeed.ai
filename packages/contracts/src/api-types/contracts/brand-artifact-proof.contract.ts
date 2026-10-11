/**
 * Artifact-bound proof attached to a brand validation check (#6727, lane P).
 *
 * A proof records what a deterministic analysis measured on the exact bytes of
 * one artifact part, so a `pass` or `fail` result is checkable after the fact.
 * Shape validation never establishes authority: a caller must still verify the
 * bytes against the part hash and the report against the artifact hash.
 */
import { z } from 'zod';
import {
  learningContractHashSchema as hash,
  learningContractIdSchema as id,
} from './content-learning-generation.contract';

const share = z.number().finite().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9A-F]{6}$/);
const label = z.string().min(1).max(512);

export const BRAND_PALETTE_PROOF_LIMITS = {
  swatches: 8,
  frames: 16,
} as const;

export const brandPaletteProofV1Schema = z.strictObject({
  kind: z.literal('palette'),
  /** Names the comparison so a later algorithm change cannot reuse this proof. */
  algorithm: z.literal('ciede2000-presence-v1'),
  /** The artifact manifest hash the report validates; the proof is void for any other. */
  artifactHash: hash,
  partId: id,
  partVersion: id,
  /** The sha256 of the exact part bytes that were decoded. */
  partHash: hash,
  mediaKind: z.enum(['image', 'video']),
  /** The decoder that produced the pixels, e.g. `sharp` or `ffmpeg`. */
  decoder: label,
  /** Frames analyzed: 1 for a still image, the sampled frames for a video. */
  sampledFrames: z.number().int().min(1).max(BRAND_PALETTE_PROOF_LIMITS.frames),
  /** Opaque pixels compared across all analyzed frames. */
  analyzedPixels: z.number().int().min(1),
  /** The approved color this proof is about. */
  target: hexColor,
  /** CIEDE2000 distance at or below which a pixel counts as the approved color. */
  maxDeltaE: z.number().finite().positive(),
  /** Share of opaque pixels that must match for the color to count as present. */
  minCoverage: share,
  /** Measured share of opaque pixels within `maxDeltaE` of `target`. */
  coverage: share,
  /** The smallest CIEDE2000 distance between any measured swatch and `target`. */
  nearestSwatchDeltaE: z.number().finite().min(0),
  /** The dominant colors actually measured, largest first. */
  swatches: z
    .array(z.strictObject({ color: hexColor, share }))
    .max(BRAND_PALETTE_PROOF_LIMITS.swatches),
});

export const BRAND_OCR_PROOF_LIMITS = {
  frames: 16,
} as const;

/**
 * Text read from the final pixels by a provider-backed OCR model, matched
 * against one mandatory or avoid literal. The evidence is the hash of the text
 * each frame yielded, not the text: an auditor re-runs the model on the bound
 * part and compares hashes.
 */
export const brandOcrProofV1Schema = z.strictObject({
  kind: z.literal('ocr'),
  /** Names the matching so a later change cannot reuse this proof. */
  algorithm: z.literal('ocr-literal-v1'),
  artifactHash: hash,
  partId: id,
  partVersion: id,
  partHash: hash,
  mediaKind: z.enum(['image', 'video']),
  /** How the frames given to the model were produced, e.g. `sharp/libvips-8.18.7`. */
  decoder: label,
  /** The OCR model and its pinned version. */
  provider: z.strictObject({
    id: label,
    model: label,
    version: label,
  }),
  sampledFrames: z.number().int().min(1).max(BRAND_OCR_PROOF_LIMITS.frames),
  /** sha256 of the NFC, LF-normalized text read from each analyzed frame, in order. */
  frameTextHashes: z.array(hash).min(1).max(BRAND_OCR_PROOF_LIMITS.frames),
  /** Frame indexes whose text contains the literal. */
  matchedFrames: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(BRAND_OCR_PROOF_LIMITS.frames - 1),
    )
    .max(BRAND_OCR_PROOF_LIMITS.frames),
});

export const BRAND_PLACEMENT_PROOF_LIMITS = {
  detections: 8,
  frames: 16,
} as const;

const unit = z.number().finite().min(0).max(1);

/**
 * An approved logo or product asset found in the final pixels: an open-vocabulary
 * detector proposed a region, and the region was then compared with the approved
 * reference asset's own pixels. Only a verified match is evidence; no detection,
 * or a region that does not match, proves nothing and is never recorded here.
 */
export const brandPlacementProofV1Schema = z.strictObject({
  kind: z.literal('placement'),
  /** Names the detection and matching so a later change cannot reuse this proof. */
  algorithm: z.literal('detect-then-match-v1'),
  artifactHash: hash,
  partId: id,
  partVersion: id,
  partHash: hash,
  mediaKind: z.enum(['image', 'video']),
  /** How the frames given to the model were produced, e.g. `sharp/libvips-8.18.7`. */
  decoder: label,
  /** The detection model and its version. */
  provider: z.strictObject({
    id: label,
    model: label,
    version: label,
  }),
  /** The approved asset the region was matched against, and its verified hash. */
  referenceAssetId: id,
  referenceHash: hash,
  /** The text the detector was asked to find. */
  query: label,
  sampledFrames: z
    .number()
    .int()
    .min(1)
    .max(BRAND_PLACEMENT_PROOF_LIMITS.frames),
  /** Detector confidence at or above which a region was compared with the reference. */
  minDetectionScore: unit,
  /** Pixel similarity (zero-mean normalized correlation, 0..1) at or above which a region matches. */
  minSimilarity: unit,
  /** The regions that matched, best first; boxes are fractions of the frame. */
  matches: z
    .array(
      z.strictObject({
        frame: z
          .number()
          .int()
          .min(0)
          .max(BRAND_PLACEMENT_PROOF_LIMITS.frames - 1),
        score: unit,
        similarity: unit,
        box: z.strictObject({
          x: unit,
          y: unit,
          width: unit,
          height: unit,
        }),
      }),
    )
    .min(1)
    .max(BRAND_PLACEMENT_PROOF_LIMITS.detections),
});

export const brandArtifactProofV1Schema = z.discriminatedUnion('kind', [
  brandPaletteProofV1Schema,
  brandOcrProofV1Schema,
  brandPlacementProofV1Schema,
]);

export type BrandOcrProofV1 = z.infer<typeof brandOcrProofV1Schema>;
export type BrandPlacementProofV1 = z.infer<typeof brandPlacementProofV1Schema>;
export type BrandPaletteProofV1 = z.infer<typeof brandPaletteProofV1Schema>;
export type BrandArtifactProofV1 = z.infer<typeof brandArtifactProofV1Schema>;
