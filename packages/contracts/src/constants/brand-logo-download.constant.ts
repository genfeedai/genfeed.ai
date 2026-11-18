/**
 * Formats and sizes a brand logo downloads in (#9706). An SVG is only offered
 * for a logo uploaded as an SVG; PNG and WEBP render at the chosen longest side.
 */
export const BRAND_LOGO_DOWNLOAD_FORMATS = ['png', 'webp', 'svg'] as const;

export type BrandLogoDownloadFormat =
  (typeof BRAND_LOGO_DOWNLOAD_FORMATS)[number];

/** Longest side in pixels the download menu offers for PNG and WEBP. */
export const BRAND_LOGO_DOWNLOAD_SIZES = [512, 1024, 2048, 4096] as const;

export const BRAND_LOGO_DOWNLOAD_MIN_SIZE = 16;
export const BRAND_LOGO_DOWNLOAD_MAX_SIZE = 4096;
export const BRAND_LOGO_DOWNLOAD_DEFAULT_SIZE = 1024;

/** The `originalFormat` an asset uploaded as an SVG records. */
export const ASSET_ORIGINAL_FORMAT_SVG = 'svg';
