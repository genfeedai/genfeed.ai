import { z } from 'zod';

/**
 * What the visual-code renderer observed in Chromium for one exported file.
 * Mirrors `validateEvidence` in scripts/visual-code/protocol.mjs. The renderer
 * is trusted code, but every string here originates in an untrusted composition,
 * so the schema stays closed and bounded and nothing is rendered as a claim until
 * the manifest builder has bound it to the exact output bytes.
 */
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const assetId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const bounds = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
});
const source = z.strictObject({
  kind: z.enum(['asset', 'embedded', 'external', 'unknown']),
  assetId: assetId.nullable(),
  contentHash: hash.nullable(),
});

export const visualRenderObservationsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  browser: z
    .strictObject({
      product: z.string().max(128).nullable(),
      revision: z.string().max(128).nullable(),
    })
    .nullable(),
  frameCount: z.number().int().min(1).max(100_000),
  captures: z
    .array(
      z.strictObject({
        frame: z.number().int().min(0),
        textLayers: z
          .array(
            z.strictObject({
              text: z.string().max(2000),
              isTextTruncated: z.boolean(),
              bounds,
              fontFamily: z.string().max(1024),
              fontSizePx: z.number().finite().min(0),
              fontWeight: z.string().max(32).nullable(),
              fontStyle: z.string().max(32).nullable(),
              color: z.strictObject({
                css: z.string().max(64),
                hex: z
                  .string()
                  .regex(/^#[0-9A-F]{8}$/)
                  .nullable(),
              }),
              opacity: z.number().min(0).max(1),
              platformFonts: z
                .array(
                  z.strictObject({
                    familyName: z.string().min(1).max(512),
                    postScriptName: z.string().max(512).nullable(),
                    isCustomFont: z.boolean(),
                    glyphCount: z.number().int().min(0),
                  }),
                )
                .max(16)
                .nullable(),
            }),
          )
          .max(256),
        placedAssets: z
          .array(
            z.strictObject({
              role: z.enum(['image', 'video', 'background_image']),
              sourceKind: source.shape.kind,
              assetId: source.shape.assetId,
              contentHash: source.shape.contentHash,
              bounds,
              transform: z.string().max(256),
              opacity: z.number().min(0).max(1),
            }),
          )
          .max(256),
      }),
    )
    .max(16),
  fontFaces: z
    .array(
      z.strictObject({
        family: z.string().max(512),
        style: z.string().max(32),
        weight: z.string().max(32),
        platformFamily: z.string().max(512).nullable(),
        source,
      }),
    )
    .max(64),
  assets: z.array(z.strictObject({ id: assetId, contentHash: hash })).max(12),
  diagnostics: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,95}$/)).max(32),
});

export type VisualRenderObservations = z.infer<
  typeof visualRenderObservationsSchema
>;
