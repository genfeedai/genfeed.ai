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

export const BRAND_FONT_PROOF_LIMITS = {
  fonts: 16,
} as const;

/**
 * An approved font shown to have drawn every text layer of an exported still, by
 * a render manifest the platform's own renderer emitted and the caller verified
 * against the exported bytes. The renderer's trust is the evidence: a model's
 * image has no manifest, and its fonts stay unknown.
 */
export const brandFontProofV1Schema = z.strictObject({
  kind: z.literal('font'),
  /** Names the matching so a later change cannot reuse this proof. */
  algorithm: z.literal('render-manifest-font-v1'),
  artifactHash: hash,
  partId: id,
  partVersion: id,
  partHash: hash,
  /** A still: sampled video frames never prove every text layer. */
  mediaKind: z.literal('image'),
  /** The verified manifest this proof reads, by id and canonical hash. */
  manifestId: id,
  manifestHash: hash,
  renderer: z.strictObject({
    id: label,
    version: label,
    engine: label,
  }),
  /** The one frame the manifest inspected: a proof is only made for complete coverage. */
  frame: z.number().int().min(0),
  /** Text layers inspected; every one was drawn only with approved fonts, none with a fallback. */
  textLayers: z.number().int().min(1),
  /** The fonts matching the approved rule, as the font engine reported them. */
  matchedFonts: z
    .array(
      z.strictObject({
        fontId: id,
        family: label,
        weight: z.number().int().min(1).max(1000).nullable(),
        style: z.enum(['normal', 'italic', 'oblique']).nullable(),
        sourceKind: z.enum(['asset', 'embedded', 'system']),
      }),
    )
    .min(1)
    .max(BRAND_FONT_PROOF_LIMITS.fonts),
});

export const BRAND_FACT_PROOF_LIMITS = {
  claims: 32,
  citations: 3,
  knowledgeVersions: 64,
  models: 4,
} as const;

/** One passage of approved brand evidence a claim was judged against. */
export const brandFactEvidenceV1Schema = z
  .strictObject({
    /** `fact:<rule id>` for a Brand OS fact, `knowledge:<source>:<version>:<hash>` for a passage. */
    evidenceId: id,
    origin: z.enum(['brand_os', 'knowledge']),
    /** The approved Brand OS fact rule, bound to the report's snapshot hash. */
    ruleId: id.optional(),
    /** The Knowledge source version the passage came from. */
    sourceId: id.optional(),
    versionId: id.optional(),
    version: z.number().int().min(1).optional(),
    /** A verbatim span of the evidence the verdict rests on. */
    quote: z.string().min(1).max(600),
  })
  .superRefine((v, ctx) => {
    const isBound =
      v.origin === 'brand_os'
        ? v.ruleId !== undefined
        : v.sourceId !== undefined &&
          v.versionId !== undefined &&
          v.version !== undefined;
    if (!isBound)
      ctx.addIssue({
        code: 'custom',
        message: 'Evidence must name its Brand OS rule or Knowledge version',
      });
  });

export const brandFactClaimV1Schema = z
  .strictObject({
    id,
    /** The claim as a standalone statement. */
    text: z.string().min(1).max(500),
    /** A verbatim span of the checked text the claim was taken from. */
    source: z.string().min(1).max(500),
    origin: z.enum(['text', 'ocr']),
    verdict: z.enum(['supported', 'unverified', 'contradicted']),
    evidence: z
      .array(brandFactEvidenceV1Schema)
      .max(BRAND_FACT_PROOF_LIMITS.citations),
  })
  .superRefine((v, ctx) => {
    if ((v.verdict === 'unverified') !== (v.evidence.length === 0))
      ctx.addIssue({
        code: 'custom',
        message: 'Only an unverified claim may lack cited evidence',
      });
  });

/**
 * The fact check behind `system:factual_coverage` (#6717): the factual claims
 * found in the draft text, or in the text read from a visual, each judged
 * against approved brand evidence only (the approved Brand OS facts and the
 * brand's authoritative Knowledge sources). No claims is a recorded proof too.
 * The claims and the evidence are model readings, so the proof is bound to the
 * exact artifact, snapshot and Knowledge versions rather than to a byte.
 */
export const brandFactProofV1Schema = z.strictObject({
  kind: z.literal('fact'),
  /** Names the procedure so a later change cannot reuse this proof. */
  algorithm: z.literal('fact-check-v1'),
  artifactHash: hash,
  /** The Brand OS snapshot whose approved facts were evidence. */
  snapshotHash: hash,
  mediaKind: z.enum(['text', 'image', 'video']),
  /** sha256 of the NFC, LF-normalized text the claims were taken from. */
  textHash: hash,
  /** True when the text was the whole artifact, so no claim could hide outside it. */
  isTextComplete: z.boolean(),
  /** The models that extracted and judged the claims, as the provider reported them. */
  models: z.array(label).max(BRAND_FACT_PROOF_LIMITS.models),
  /** Every Knowledge source version a passage was retrieved from, sorted. */
  knowledgeVersions: z
    .array(
      z.strictObject({
        sourceId: id,
        versionId: id,
        version: z.number().int().min(1),
      }),
    )
    .max(BRAND_FACT_PROOF_LIMITS.knowledgeVersions),
  claims: z.array(brandFactClaimV1Schema).max(BRAND_FACT_PROOF_LIMITS.claims),
  /** The canonical hash of `claims`, so the list cannot change without notice. */
  claimsHash: hash,
});

export const brandArtifactProofV1Schema = z.discriminatedUnion('kind', [
  brandPaletteProofV1Schema,
  brandOcrProofV1Schema,
  brandPlacementProofV1Schema,
  brandFontProofV1Schema,
  brandFactProofV1Schema,
]);

export type BrandFactProofV1 = z.infer<typeof brandFactProofV1Schema>;
export type BrandFactClaimV1 = z.infer<typeof brandFactClaimV1Schema>;
export type BrandFactEvidenceV1 = z.infer<typeof brandFactEvidenceV1Schema>;
export type BrandOcrProofV1 = z.infer<typeof brandOcrProofV1Schema>;
export type BrandFontProofV1 = z.infer<typeof brandFontProofV1Schema>;
export type BrandPlacementProofV1 = z.infer<typeof brandPlacementProofV1Schema>;
export type BrandPaletteProofV1 = z.infer<typeof brandPaletteProofV1Schema>;
export type BrandArtifactProofV1 = z.infer<typeof brandArtifactProofV1Schema>;
