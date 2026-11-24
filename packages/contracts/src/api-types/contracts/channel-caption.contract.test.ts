import { describe, expect, it } from 'vitest';
import { describeCaptionLengthRule } from './channel-caption.contract';

describe('describeCaptionLengthRule', () => {
  it('holds a channel without an extended ceiling to its limit', () => {
    expect(describeCaptionLengthRule({ maxLength: 3000 })).toBe(
      'stay within 3000 characters',
    );
  });

  it('names the standard length and keeps the ceiling as a bound, not a target', () => {
    expect(
      describeCaptionLengthRule({ extendedMaxLength: 25_000, maxLength: 280 }),
    ).toBe(
      'stay within 280 characters unless the brief or the brand voice asks for a longer post (never more than 25000 characters)',
    );
  });
});
