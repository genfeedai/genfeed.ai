import { traced } from '@libs/tracing/traced';
import sharp from 'sharp';

const HEX_COLOR = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i;
const SAMPLE_SIZE = 48;
/** A colour is "dominant" when it covers at least this share of a frame. */
const DOMINANT_SHARE = 0.05;
/** CIE76 distance beyond which a colour no longer reads as a palette colour. */
const MAX_DELTA_E = 25;
/** Black, white and greys carry no hue; only a hue outside the palette counts. */
const NEUTRAL_CHROMA = 12;
const BUCKET_SHIFT = 5;
const MAX_ISSUES = 3;
const FRAME_NAMES = ['first', 'middle', 'last'] as const;

interface IVisualPaletteColor {
  role: string;
  color: string;
}

type VisualPaletteCheckStatus = 'passed' | 'failed' | 'not_checked';

export interface IVisualPaletteCheck {
  status: VisualPaletteCheckStatus;
  /** One issue per dominant colour outside the palette, largest first. */
  issues: string[];
}

type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

function parseHex(color: string): Rgb | null {
  const match = HEX_COLOR.exec(color);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function toLab([r, g, b]: Rgb): Lab {
  const linear = [r, g, b].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  const x =
    (0.4124 * linear[0] + 0.3576 * linear[1] + 0.1805 * linear[2]) / 0.95047;
  const y = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const z =
    (0.0193 * linear[0] + 0.1192 * linear[1] + 0.9505 * linear[2]) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function distance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface IDominantColor {
  hex: string;
  lab: Lab;
  share: number;
}

async function dominantColors(frame: Buffer): Promise<IDominantColor[]> {
  const { data, info } = await sharp(frame, { limitInputPixels: 1920 * 1080 })
    .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<
    number,
    { count: number; sum: [number, number, number] }
  >();
  const pixels = info.width * info.height;
  for (let index = 0; index < pixels; index++) {
    const r = data[index * 3];
    const g = data[index * 3 + 1];
    const b = data[index * 3 + 2];
    const key =
      ((r >> BUCKET_SHIFT) << 6) |
      ((g >> BUCKET_SHIFT) << 3) |
      (b >> BUCKET_SHIFT);
    const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
    bucket.count += 1;
    bucket.sum[0] += r;
    bucket.sum[1] += g;
    bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count / pixels >= DOMINANT_SHARE)
    .map((bucket) => {
      const mean: Rgb = [
        bucket.sum[0] / bucket.count,
        bucket.sum[1] / bucket.count,
        bucket.sum[2] / bucket.count,
      ];
      return {
        hex: toHex(mean),
        lab: toLab(mean),
        share: bucket.count / pixels,
      };
    });
}

/**
 * Checks, from the pixels of the inspected frames, that the dominant colours
 * stay inside the approved palette. A colour counts as inside when it is within
 * a perceptual distance of a palette colour, or has no hue (black, white, grey).
 * A render that cannot be read, or a brand without a palette, is `not_checked`,
 * never a pass.
 */
export const checkFramePalette = traced(
  'checkFramePalette',
  async (
    frames: readonly Buffer[],
    palette: readonly IVisualPaletteColor[],
  ): Promise<IVisualPaletteCheck> => {
    const approved = palette.flatMap((entry) => {
      const rgb = parseHex(entry.color);
      return rgb ? [{ ...entry, lab: toLab(rgb) }] : [];
    });
    if (approved.length === 0 || frames.length === 0)
      return { status: 'not_checked', issues: [] };
    const offenders = new Map<
      string,
      { frame: number; share: number; hex: string; nearest: string }
    >();
    try {
      for (const [index, frame] of frames.entries())
        for (const color of await dominantColors(frame)) {
          if (Math.hypot(color.lab[1], color.lab[2]) <= NEUTRAL_CHROMA)
            continue;
          const nearest = approved.reduce((best, entry) =>
            distance(color.lab, entry.lab) < distance(color.lab, best.lab)
              ? entry
              : best,
          );
          if (distance(color.lab, nearest.lab) <= MAX_DELTA_E) continue;
          const known = offenders.get(color.hex);
          if (!known || color.share > known.share)
            offenders.set(color.hex, {
              frame: index,
              share: color.share,
              hex: color.hex,
              nearest: `${nearest.role} ${nearest.color.toUpperCase()}`,
            });
        }
    } catch {
      return { status: 'not_checked', issues: [] };
    }
    const issues = [...offenders.values()]
      .sort((a, b) => b.share - a.share)
      .slice(0, MAX_ISSUES)
      .map(
        (entry) =>
          `Colour ${entry.hex} covers ${Math.round(entry.share * 100)}% of the ${FRAME_NAMES[entry.frame] ?? `#${entry.frame + 1}`} frame and is outside the approved palette (closest: ${entry.nearest}).`,
      );
    return { status: issues.length > 0 ? 'failed' : 'passed', issues };
  },
);
