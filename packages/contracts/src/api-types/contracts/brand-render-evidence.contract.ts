/**
 * Render evidence manifest (#6727, lane Q).
 *
 * A manifest is emitted only by a renderer the platform owns (visual projects,
 * visual code exports). It records what the renderer observed while producing
 * one final image or video file: the fonts that were really rendered (including
 * fallbacks), every text layer, and every placed asset, bound to the sha256 of
 * the exact exported bytes. Media produced by a model has no manifest, so its
 * fonts stay unknown.
 *
 * Shape validation never establishes authority. Callers must verify the artifact
 * bytes against `artifact.contentHash` and the stored scope before relying on a
 * manifest; a mismatch means the manifest is stale or forged.
 */
import { z } from 'zod';
import {
  learningContractHashSchema as hash,
  learningContractIdSchema as id,
  learningContractVersionSchema as version,
} from './content-learning-generation.contract';

const label = z.string().min(1).max(512);
const code = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9_.:-]*$/);
const date = z.iso.datetime();
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const extent = z.number().finite().min(0).max(1_000_000);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const fontStyle = z.enum(['normal', 'italic', 'oblique']);
function unique<T extends z.ZodType<{ id: string }>>(schema: T, limit: number) {
  return z
    .array(schema)
    .max(limit)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate IDs',
    );
}

export const BRAND_RENDER_EVIDENCE_LIMITS = {
  fonts: 64,
  frames: 16,
  placedAssets: 256,
  textLayers: 256,
  textLength: 2000,
} as const;

export const brandRenderEvidenceBoundsV1Schema = z.strictObject({
  x: coordinate,
  y: coordinate,
  width: extent,
  height: extent,
});

export const brandRenderEvidenceArtifactV1Schema = z.strictObject({
  kind: z.enum(['ingredient', 'visual_export']),
  id,
  storageKey: label.nullable(),
  mediaKind: z.enum(['image', 'video']),
  format: z.enum(['png', 'jpeg', 'mp4']),
  mimeType: label,
  contentHash: hash,
  byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  width: z.number().int().positive().max(65535),
  height: z.number().int().positive().max(65535),
});

export const brandRenderEvidenceRendererV1Schema = z.strictObject({
  id: label,
  version: label,
  engine: z.literal('remotion-chromium'),
  engineVersion: label.nullable(),
  /** How the runtime reported loaded fonts: Chromium DevTools CSS.getPlatformFontsForNode. */
  fontReporting: z.literal('chromium-cdp-platform-fonts'),
  isolation: z.enum(['gvisor-runsc', 'none']),
});

export const brandRenderEvidenceSnapshotV1Schema = z.discriminatedUnion(
  'binding',
  [
    z.strictObject({
      /** The approved brand revision in effect when the artifact was rendered. */
      binding: z.literal('approved_at_render'),
      revisionId: id,
      revisionVersion: version,
      contentHash: hash,
    }),
    z.strictObject({
      binding: z.literal('unavailable'),
      reasonCode: code,
    }),
  ],
);

export const brandRenderEvidenceCoverageV1Schema = z
  .strictObject({
    /** `complete`: the artifact is one frame and it was inspected. */
    kind: z.enum(['complete', 'sampled_frames']),
    capturedFrames: z
      .array(count)
      .min(1)
      .max(BRAND_RENDER_EVIDENCE_LIMITS.frames),
    frameCount: z.number().int().min(1).max(100_000),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'complete' && value.capturedFrames.length !== 1)
      ctx.addIssue({
        code: 'custom',
        message: 'Complete coverage inspects exactly one frame',
      });
    if (value.capturedFrames.some((frame) => frame >= value.frameCount))
      ctx.addIssue({
        code: 'custom',
        message: 'Captured frame is outside the artifact',
      });
  });

export const brandRenderEvidenceFontSourceV1Schema = z.discriminatedUnion(
  'kind',
  [
    /** A font file supplied as an owned asset to the renderer. */
    z.strictObject({
      kind: z.literal('asset'),
      assetId: id,
      contentHash: hash,
    }),
    /** A font file embedded in the composition (data URI). */
    z.strictObject({ kind: z.literal('embedded'), contentHash: hash }),
    /** A font installed in the renderer image. Its bytes are not hashed. */
    z.strictObject({ kind: z.literal('system'), contentHash: z.null() }),
    z.strictObject({ kind: z.literal('unknown'), contentHash: z.null() }),
  ],
);

export const brandRenderEvidenceFontV1Schema = z.strictObject({
  id,
  /** Family the font engine actually rendered, not the family requested. */
  family: label,
  postScriptName: label.nullable(),
  /** `@font-face` family name for a loaded web font; null for system fonts. */
  declaredFamily: label.nullable(),
  weight: z.number().int().min(1).max(1000).nullable(),
  style: fontStyle.nullable(),
  source: brandRenderEvidenceFontSourceV1Schema,
  glyphCount: count,
});

export const brandRenderEvidenceFontFallbackV1Schema = z.strictObject({
  layerId: id,
  /** First named family the layer asked for; null when it asked for generics only. */
  requestedFamily: label.nullable(),
  usedFontId: id,
  glyphCount: count,
  reason: z.enum([
    'family_unavailable',
    'glyph_not_covered',
    'generic_family_only',
  ]),
});

export const brandRenderEvidenceTextLayerV1Schema = z.strictObject({
  id,
  frame: count,
  text: z.string().max(BRAND_RENDER_EVIDENCE_LIMITS.textLength),
  isTextTruncated: z.boolean(),
  bounds: brandRenderEvidenceBoundsV1Schema,
  declaredFontFamily: z.string().max(1024),
  fontSizePx: extent,
  requestedWeight: z.number().int().min(1).max(1000).nullable(),
  requestedStyle: fontStyle.nullable(),
  color: z.strictObject({
    css: z.string().min(1).max(64),
    hex: z.string().regex(/^#[0-9A-F]{8}$/),
  }),
  opacity: z.number().min(0).max(1),
  fontUsage: z.array(z.strictObject({ fontId: id, glyphCount: count })).max(16),
});

export const brandRenderEvidencePlacedAssetV1Schema = z.strictObject({
  id,
  frame: count,
  role: z.enum(['image', 'video', 'background_image']),
  assetId: id.nullable(),
  /** Hash of the asset bytes the renderer loaded; null when unresolved. */
  contentHash: hash.nullable(),
  bounds: brandRenderEvidenceBoundsV1Schema,
  transform: z.strictObject({
    css: z.string().max(256),
    matrix: z
      .tuple([
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
      ])
      .nullable(),
  }),
  opacity: z.number().min(0).max(1),
});

export const brandRenderEvidenceManifestV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('brand_render_evidence'),
    id,
    organizationId: id,
    brandId: id,
    capturedAt: date,
    artifact: brandRenderEvidenceArtifactV1Schema,
    renderer: brandRenderEvidenceRendererV1Schema,
    brandSnapshot: brandRenderEvidenceSnapshotV1Schema,
    coverage: brandRenderEvidenceCoverageV1Schema,
    fonts: unique(
      brandRenderEvidenceFontV1Schema,
      BRAND_RENDER_EVIDENCE_LIMITS.fonts,
    ),
    textLayers: unique(
      brandRenderEvidenceTextLayerV1Schema,
      BRAND_RENDER_EVIDENCE_LIMITS.textLayers,
    ),
    fallbacks: z
      .array(brandRenderEvidenceFontFallbackV1Schema)
      .max(BRAND_RENDER_EVIDENCE_LIMITS.textLayers * 4),
    placedAssets: unique(
      brandRenderEvidencePlacedAssetV1Schema,
      BRAND_RENDER_EVIDENCE_LIMITS.placedAssets,
    ),
    diagnostics: z.array(code).max(32),
    /** sha256 over the canonical JSON of every other field. */
    contentHash: hash,
  })
  .superRefine((manifest, ctx) => {
    const fonts = new Set(manifest.fonts.map((font) => font.id));
    const layers = new Set(manifest.textLayers.map((layer) => layer.id));
    const captured = new Set(manifest.coverage.capturedFrames);
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    for (const layer of manifest.textLayers) {
      if (!captured.has(layer.frame)) issue('Text layer outside coverage');
      if (layer.fontUsage.some((usage) => !fonts.has(usage.fontId)))
        issue('Text layer uses an unlisted font');
    }
    for (const asset of manifest.placedAssets)
      if (!captured.has(asset.frame)) issue('Placed asset outside coverage');
    for (const fallback of manifest.fallbacks) {
      if (!layers.has(fallback.layerId)) issue('Fallback for unlisted layer');
      if (!fonts.has(fallback.usedFontId)) issue('Fallback uses unlisted font');
    }
  });

export type BrandRenderEvidenceBoundsV1 = z.infer<
  typeof brandRenderEvidenceBoundsV1Schema
>;
export type BrandRenderEvidenceArtifactV1 = z.infer<
  typeof brandRenderEvidenceArtifactV1Schema
>;
export type BrandRenderEvidenceRendererV1 = z.infer<
  typeof brandRenderEvidenceRendererV1Schema
>;
export type BrandRenderEvidenceSnapshotV1 = z.infer<
  typeof brandRenderEvidenceSnapshotV1Schema
>;
export type BrandRenderEvidenceCoverageV1 = z.infer<
  typeof brandRenderEvidenceCoverageV1Schema
>;
export type BrandRenderEvidenceFontSourceV1 = z.infer<
  typeof brandRenderEvidenceFontSourceV1Schema
>;
export type BrandRenderEvidenceFontV1 = z.infer<
  typeof brandRenderEvidenceFontV1Schema
>;
export type BrandRenderEvidenceFontFallbackV1 = z.infer<
  typeof brandRenderEvidenceFontFallbackV1Schema
>;
export type BrandRenderEvidenceTextLayerV1 = z.infer<
  typeof brandRenderEvidenceTextLayerV1Schema
>;
export type BrandRenderEvidencePlacedAssetV1 = z.infer<
  typeof brandRenderEvidencePlacedAssetV1Schema
>;
export type BrandRenderEvidenceManifestV1 = z.infer<
  typeof brandRenderEvidenceManifestV1Schema
>;

/**
 * Outcome of reading a manifest for an artifact. Only `verified` carries a
 * manifest. Anything else must keep font and layout checks unknown.
 */
export type BrandRenderEvidenceVerificationV1 =
  | { status: 'verified'; manifest: BrandRenderEvidenceManifestV1 }
  | { status: 'missing'; manifest: null; reasonCode: 'manifest_not_found' }
  | {
      status: 'rejected';
      manifest: null;
      reasonCode:
        | 'manifest_invalid'
        | 'manifest_hash_mismatch'
        | 'artifact_hash_mismatch'
        | 'artifact_identity_mismatch'
        | 'scope_mismatch';
    };
