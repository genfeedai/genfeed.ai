import { z } from 'zod';
import { BRAND_END_CARD_LIMITS } from '../../constants/media.constant';

const assetId = z.string().min(1).max(128);

export const BRAND_VIDEO_FINISHING_DEFAULTS = {
  watermarkOpacity: 0.35,
  watermarkPosition: 'bottom-right',
} as const;

export const brandWatermarkPositionValues = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

/**
 * What the brand does to a finished video: the closing end card, the colour
 * grade and the export watermark (#10187). It rides on a Brand OS revision, so a
 * change has a version and an approver. On approve it is copied to the brand
 * row, which the stitch and export code keep reading. It is not a model input,
 * so it is not part of the generation rules snapshot.
 *
 * Field names and defaults mirror the `brands` columns one to one. The LUT file
 * itself stays in storage and is uploaded through `PUT /brands/:id/lut`; the
 * revision only records whether the grade is on and which file it is.
 */
export const brandVideoFinishingV1Schema = z.strictObject({
  endCard: z.strictObject({
    assetId: assetId.optional(),
    durationSeconds: z
      .number()
      .min(BRAND_END_CARD_LIMITS.MIN_DURATION_SECONDS)
      .max(BRAND_END_CARD_LIMITS.MAX_DURATION_SECONDS),
    isEnabled: z.boolean(),
  }),
  lut: z.strictObject({
    fileName: z.string().min(1).max(255).optional(),
    isEnabled: z.boolean(),
  }),
  watermark: z.strictObject({
    insetXRatio: z.number().min(0).max(0.5).optional(),
    insetYRatio: z.number().min(0).max(0.5).optional(),
    lightLogoId: assetId.optional(),
    liveLogoId: assetId.optional(),
    logoId: assetId.optional(),
    opacity: z.number().min(0.05).max(1),
    position: z.enum(brandWatermarkPositionValues),
    sizeRatio: z.number().min(0.01).max(0.5).optional(),
    text: z.string().max(120).optional(),
  }),
});

export type BrandVideoFinishingV1 = z.infer<typeof brandVideoFinishingV1Schema>;

/** Returns the finishing section when it parses, otherwise undefined. */
export function parseBrandVideoFinishing(
  value: unknown,
): BrandVideoFinishingV1 | undefined {
  const parsed = brandVideoFinishingV1Schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The `brands` columns the finishing section mirrors. */
export interface BrandFinishingRow {
  endCardAssetId?: string | null;
  endCardDurationSeconds?: number | null;
  isEndCardEnabled?: boolean | null;
  isLutEnabled?: boolean | null;
  lutFileName?: string | null;
  watermarkInsetXRatio?: number | null;
  watermarkInsetYRatio?: number | null;
  watermarkLightLogoId?: string | null;
  watermarkLiveLogoId?: string | null;
  watermarkLogoId?: string | null;
  watermarkOpacity?: number | null;
  watermarkPosition?: string | null;
  watermarkSizeRatio?: number | null;
  watermarkText?: string | null;
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

/** The finishing section a brand row currently carries. */
export function buildBrandVideoFinishing(
  row: BrandFinishingRow,
): BrandVideoFinishingV1 {
  const position = brandWatermarkPositionValues.find(
    (value) => value === row.watermarkPosition,
  );
  return {
    endCard: {
      assetId: optional(row.endCardAssetId),
      durationSeconds:
        row.endCardDurationSeconds ??
        BRAND_END_CARD_LIMITS.DEFAULT_DURATION_SECONDS,
      isEnabled: row.isEndCardEnabled ?? false,
    },
    lut: {
      fileName: optional(row.lutFileName),
      isEnabled: row.isLutEnabled ?? false,
    },
    watermark: {
      insetXRatio: optional(row.watermarkInsetXRatio),
      insetYRatio: optional(row.watermarkInsetYRatio),
      lightLogoId: optional(row.watermarkLightLogoId),
      liveLogoId: optional(row.watermarkLiveLogoId),
      logoId: optional(row.watermarkLogoId),
      opacity:
        row.watermarkOpacity ?? BRAND_VIDEO_FINISHING_DEFAULTS.watermarkOpacity,
      position: position ?? BRAND_VIDEO_FINISHING_DEFAULTS.watermarkPosition,
      sizeRatio: optional(row.watermarkSizeRatio),
      text: optional(row.watermarkText),
    },
  };
}

/** The brand row columns an approved finishing section writes. */
export function brandFinishingColumns(finishing: BrandVideoFinishingV1) {
  const { endCard, lut, watermark } = finishing;
  return {
    endCardAssetId: endCard.assetId ?? null,
    endCardDurationSeconds: endCard.durationSeconds,
    isEndCardEnabled: endCard.isEnabled,
    isLutEnabled: lut.isEnabled,
    watermarkInsetXRatio: watermark.insetXRatio ?? null,
    watermarkInsetYRatio: watermark.insetYRatio ?? null,
    watermarkLightLogoId: watermark.lightLogoId ?? null,
    watermarkLiveLogoId: watermark.liveLogoId ?? null,
    watermarkLogoId: watermark.logoId ?? null,
    watermarkOpacity: watermark.opacity,
    watermarkPosition: watermark.position,
    watermarkSizeRatio: watermark.sizeRatio ?? null,
    watermarkText: watermark.text ?? null,
  };
}
