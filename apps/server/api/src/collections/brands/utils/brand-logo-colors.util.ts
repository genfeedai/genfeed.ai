import {
  type BrandRgb,
  brandDeltaE2000,
  brandRgbToLab,
  formatBrandHexColor,
} from '@api/services/brand-validation/brand-validation-color.util';
import type { BrandPixelFrame } from '@api/services/brand-validation/brand-validation-pixels.util';
import type { IBrandKitLogoColor } from '@genfeedai/contracts/interfaces';

/** Pixels at least this opaque count; a transparent logo background does not. */
const MIN_ALPHA = 128;
/** Bits kept per channel when pixels are grouped (16 levels per channel). */
const BUCKET_SHIFT = 4;
/** Colors closer than this (CIEDE2000) read as the same brand color. */
const DISTINCT_DELTA_E = 12;
/** A color has to cover this share of the opaque pixels to be offered. */
const MIN_SHARE = 0.01;

export const BRAND_LOGO_COLOR_LIMIT = 6;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Candidate palette colors from a decoded logo: the most covered colors that
 * are visibly different from each other, most covered first. Transparent
 * pixels are ignored, so a logo on a transparent background gives the colors
 * of the mark only.
 */
export function extractBrandLogoColors(
  frame: BrandPixelFrame,
  limit = BRAND_LOGO_COLOR_LIMIT,
): IBrandKitLogoColor[] {
  const buckets = new Map<number, Bucket>();
  let opaque = 0;
  for (let offset = 0; offset + 3 < frame.rgba.length; offset += 4) {
    if (frame.rgba[offset + 3] < MIN_ALPHA) continue;
    const r = frame.rgba[offset];
    const g = frame.rgba[offset + 1];
    const b = frame.rgba[offset + 2];
    const key =
      ((r >> BUCKET_SHIFT) << 8) |
      ((g >> BUCKET_SHIFT) << 4) |
      (b >> BUCKET_SHIFT);
    const bucket = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    opaque += 1;
  }
  if (opaque === 0) return [];
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const picked: Array<{ rgb: BrandRgb; count: number }> = [];
  for (const bucket of ranked) {
    if (bucket.count / opaque < MIN_SHARE) break;
    const rgb: BrandRgb = [
      bucket.r / bucket.count,
      bucket.g / bucket.count,
      bucket.b / bucket.count,
    ];
    const lab = brandRgbToLab(rgb);
    const near = picked.find(
      (color) =>
        brandDeltaE2000(brandRgbToLab(color.rgb), lab) < DISTINCT_DELTA_E,
    );
    if (near) {
      near.count += bucket.count;
      continue;
    }
    if (picked.length < limit) picked.push({ count: bucket.count, rgb });
  }
  return picked
    .sort((a, b) => b.count - a.count)
    .map((color) => ({
      hex: formatBrandHexColor(color.rgb),
      share: Math.round((color.count / opaque) * 1000) / 1000,
    }));
}
