/**
 * Brand banner format. It is the X (Twitter) header size, 1500x500 (3:1), so a
 * banner imports from and exports to X unchanged. Upload, crop, generation and
 * every display share these numbers; never hard-code a banner ratio.
 */
export const BRAND_BANNER_WIDTH = 1500;
export const BRAND_BANNER_HEIGHT = 500;
export const BRAND_BANNER_ASPECT_RATIO =
  BRAND_BANNER_WIDTH / BRAND_BANNER_HEIGHT;

/**
 * Generation size for a banner: the same 3:1 ratio, rounded to the multiple of
 * 16 image models require. The result is cropped to the banner frame on
 * display.
 */
export const BRAND_BANNER_GENERATION_WIDTH = 1536;
export const BRAND_BANNER_GENERATION_HEIGHT = 512;
