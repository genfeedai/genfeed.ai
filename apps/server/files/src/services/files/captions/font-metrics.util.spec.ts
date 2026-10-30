import path from 'node:path';
import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { measureTextWidth } from '@files/services/files/captions/font-metrics.util';
import { describe, expect, it } from 'vitest';

const font = resolveFontFile('INTER_BOLD');

describe('measureTextWidth', () => {
  it('measures from the font: wide capitals exceed narrow letters, width scales with size', () => {
    const narrow = measureTextWidth(font, 'iiii', 100);
    const wide = measureTextWidth(font, 'WWWW', 100);
    expect(narrow).not.toBeNull();
    expect(wide).toBeGreaterThan((narrow ?? 0) * 2);
    expect(measureTextWidth(font, 'WWWW', 50)).toBeCloseTo((wide ?? 0) / 2, 5);
  });

  it('adds the advance of a space between words', () => {
    const joined = measureTextWidth(font, 'ab', 80) ?? 0;
    const spaced = measureTextWidth(font, 'a b', 80) ?? 0;
    expect(spaced).toBeGreaterThan(joined);
  });

  it('returns null for a file that is not a font', () => {
    expect(
      measureTextWidth(path.join(__dirname, 'missing.ttf'), 'a', 10),
    ).toBeNull();
  });
});
