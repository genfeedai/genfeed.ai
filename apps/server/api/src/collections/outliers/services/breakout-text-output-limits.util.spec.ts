import { breakoutTextOutputLimits } from '@api/collections/outliers/services/breakout-text-output-limits.util';
import type { AccountPublishingConstraints } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const constraints: AccountPublishingConstraints = {
  maxWeightedCharacters: 280,
  supportsDirectPublishing: true,
  supportsRichArticleCopy: false,
  supportsThreads: true,
  usesWeightedCharacters: true,
  notes: [],
};
describe('breakout text estimation and actual channel acceptance', () => {
  it('counts the complete nine-part thread including separators', () => {
    expect(breakoutTextOutputLimits('thread', constraints)).toMatchObject({
      segmentCharacterLimit: 280,
      totalCharacterLimit: 2536,
    });
  });
  it('honors real X weighting and rejects raw text larger than the pricing bound', () => {
    const limits = breakoutTextOutputLimits('text', constraints);
    expect(limits?.acceptSegment('x'.repeat(280))).toBe(true);
    expect(limits?.acceptSegment('界'.repeat(141))).toBe(false);
    expect(
      limits?.acceptSegment(`https://example.com/${'x'.repeat(500)}`),
    ).toBe(false);
    expect(limits?.acceptSegment('')).toBe(false);
  });
  it.each([undefined, 0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'holds an unavailable account constraint %s',
    (maxWeightedCharacters) => {
      expect(
        breakoutTextOutputLimits('text', {
          ...constraints,
          maxWeightedCharacters,
        }),
      ).toBeNull();
    },
  );
  it('uses the declared account counting mode and bounds an ordinary platform thread', () => {
    const limits = breakoutTextOutputLimits('thread', {
      ...constraints,
      usesWeightedCharacters: false,
      maxCharacters: 5000,
    });
    expect(limits).toMatchObject({
      segmentCharacterLimit: 1500,
      totalCharacterLimit: 13516,
    });
    expect(limits?.acceptSegment('界'.repeat(1500))).toBe(true);
    expect(limits?.acceptSegment('x'.repeat(1501))).toBe(false);
  });
});
