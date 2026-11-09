import { extractBrandLogoColors } from '@api/collections/brands/utils/brand-logo-colors.util';
import type { BrandPixelFrame } from '@api/services/brand-validation/brand-validation-pixels.util';
import { describe, expect, it } from 'vitest';

type Pixel = readonly [number, number, number, number];

/** A one-row frame made of runs of the same pixel. */
function frameOf(
  runs: ReadonlyArray<readonly [Pixel, number]>,
): BrandPixelFrame {
  const pixels = runs.flatMap(([pixel, count]) =>
    Array.from({ length: count }, () => pixel),
  );
  return {
    height: 1,
    rgba: Uint8Array.from(pixels.flat()),
    width: pixels.length,
  };
}

const RED: Pixel = [230, 30, 40, 255];
const NEAR_RED: Pixel = [228, 34, 42, 255];
const NAVY: Pixel = [20, 30, 90, 255];
const WHITE: Pixel = [255, 255, 255, 255];
const CLEAR: Pixel = [0, 0, 0, 0];

describe('extractBrandLogoColors', () => {
  it('ignores transparent pixels, so only the mark is read', () => {
    expect(
      extractBrandLogoColors(
        frameOf([
          [CLEAR, 900],
          [RED, 60],
          [NAVY, 40],
        ]),
      ),
    ).toEqual([
      { hex: '#E61E28', share: 0.6 },
      { hex: '#141E5A', share: 0.4 },
    ]);
  });

  it('merges shades that read as the same color', () => {
    expect(
      extractBrandLogoColors(
        frameOf([
          [RED, 50],
          [NEAR_RED, 30],
          [WHITE, 20],
        ]),
      ),
    ).toEqual([
      { hex: '#E61E28', share: 0.8 },
      { hex: '#FFFFFF', share: 0.2 },
    ]);
  });

  it('leaves out specks under one percent of the logo', () => {
    expect(
      extractBrandLogoColors(
        frameOf([
          [NAVY, 995],
          [RED, 5],
        ]),
      ),
    ).toEqual([{ hex: '#141E5A', share: 0.995 }]);
  });

  it('caps the number of suggestions', () => {
    expect(
      extractBrandLogoColors(
        frameOf([
          [RED, 50],
          [NAVY, 30],
          [WHITE, 20],
        ]),
        2,
      ),
    ).toEqual([
      { hex: '#E61E28', share: 0.5 },
      { hex: '#141E5A', share: 0.3 },
    ]);
  });

  it('suggests nothing for a fully transparent image', () => {
    expect(extractBrandLogoColors(frameOf([[CLEAR, 10]]))).toEqual([]);
  });
});
