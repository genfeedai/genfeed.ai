import { describe, expect, it } from 'vitest';
import { getArticleCoverPalette } from './article-cover.palette';

describe('getArticleCoverPalette', () => {
  it('is stable for the same seed and distinct across seeds', () => {
    const first = getArticleCoverPalette('shipping-without-a-studio');
    const again = getArticleCoverPalette('shipping-without-a-studio');
    const other = getArticleCoverPalette('a-different-article');

    expect(first).toEqual(again);
    expect(first.from).not.toBe(other.from);
    expect(first.accent).not.toBe(other.accent);
  });

  it('falls back to a shared seed when the slug is empty', () => {
    expect(getArticleCoverPalette('')).toEqual(
      getArticleCoverPalette('genfeed'),
    );
  });

  it('keeps the companion hue adjacent instead of complementary', () => {
    const palette = getArticleCoverPalette('hue-split');
    const hue = Number(palette.from.match(/hsl\((\d+)/u)?.[1]);
    const companion = Number(palette.to.match(/hsl\((\d+)/u)?.[1]);

    expect(Number.isFinite(hue)).toBe(true);
    expect((companion - hue + 360) % 360).toBe(48);
    expect(palette.base).toBe('hsl(0 0% 4%)');
  });
});
