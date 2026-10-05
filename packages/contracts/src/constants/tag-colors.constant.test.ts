import { describe, expect, it } from 'vitest';
import { pickTagColor, TAG_COLOR_PALETTE } from './tag-colors.constant';

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );

  return (lighter + 0.05) / (darker + 0.05);
}

describe('TAG_COLOR_PALETTE', () => {
  it('pairs every background with a text color that keeps AA contrast', () => {
    for (const swatch of TAG_COLOR_PALETTE) {
      expect(
        contrast(swatch.backgroundColor, swatch.textColor),
        swatch.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has no duplicate backgrounds', () => {
    const backgrounds = TAG_COLOR_PALETTE.map(
      (swatch) => swatch.backgroundColor,
    );

    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });
});

describe('pickTagColor', () => {
  it('gives the same label the same swatch, however it is cased or padded', () => {
    expect(pickTagColor('  S1E12 ')).toEqual(pickTagColor('s1e12'));
  });

  it('always returns a palette swatch', () => {
    for (const label of ['a', 'Launch', 'ShipShit Show', '日本語', '']) {
      expect(TAG_COLOR_PALETTE).toContainEqual(pickTagColor(label));
    }
  });
});
