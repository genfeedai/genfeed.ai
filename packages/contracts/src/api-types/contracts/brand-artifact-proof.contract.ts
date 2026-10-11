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

export const brandArtifactProofV1Schema = z.discriminatedUnion('kind', [
  brandPaletteProofV1Schema,
]);

export type BrandPaletteProofV1 = z.infer<typeof brandPaletteProofV1Schema>;
export type BrandArtifactProofV1 = z.infer<typeof brandArtifactProofV1Schema>;
