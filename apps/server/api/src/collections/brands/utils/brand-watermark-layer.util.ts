import type {
  IWatermarkLayer,
  WatermarkPosition,
  WatermarkVariant,
} from '@genfeedai/contracts/interfaces';

export interface BrandWatermarkSettings {
  watermarkInsetXRatio?: number | null;
  watermarkInsetYRatio?: number | null;
  watermarkLightLogoId?: string | null;
  watermarkLiveLogoId?: string | null;
  watermarkLogoId?: string | null;
  watermarkOpacity: number;
  watermarkPosition: string;
  watermarkSizeRatio?: number | null;
}

/** The mark for a background: its own asset when the brand set one, else the default. */
export function watermarkLogoIdFor(
  brand: BrandWatermarkSettings,
  variant: WatermarkVariant,
): string | null {
  const own =
    variant === 'light'
      ? brand.watermarkLightLogoId
      : variant === 'live'
        ? brand.watermarkLiveLogoId
        : null;
  return own ?? brand.watermarkLogoId ?? null;
}

/**
 * Corner, opacity, size and insets of a brand's watermark. Size and insets are
 * left out when the brand did not set them, so the files service keeps its
 * own defaults.
 */
export function watermarkPlacementFor(
  brand: BrandWatermarkSettings,
): Pick<
  IWatermarkLayer,
  'insetXRatio' | 'insetYRatio' | 'opacity' | 'position' | 'sizeRatio'
> {
  return {
    opacity: brand.watermarkOpacity,
    position: brand.watermarkPosition as WatermarkPosition,
    ...(brand.watermarkSizeRatio != null
      ? { sizeRatio: brand.watermarkSizeRatio }
      : {}),
    ...(brand.watermarkInsetXRatio != null
      ? { insetXRatio: brand.watermarkInsetXRatio }
      : {}),
    ...(brand.watermarkInsetYRatio != null
      ? { insetYRatio: brand.watermarkInsetYRatio }
      : {}),
  };
}
