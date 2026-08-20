import { describe, expect, it } from 'vitest';
import { getHeadlineSize, HEADLINE_CAP, truncateHeadline } from './headline';

describe('truncateHeadline', () => {
  it('leaves a headline within the cap untouched', () => {
    const label = 'How to prompt AI content: the CLEAR framework';

    expect(truncateHeadline(label)).toBe(label);
  });

  it('cuts back to the last whole word rather than mid-word', () => {
    const label = `${'word '.repeat(40)}truncatedhere`;
    const result = truncateHeadline(label);

    expect(result.endsWith('word…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(HEADLINE_CAP);
  });

  it('falls back to a hard slice when there is no word break to back up to', () => {
    const result = truncateHeadline('x'.repeat(400));

    expect(result).toBe(`${'x'.repeat(HEADLINE_CAP - 1)}…`);
    expect(result.length).toBe(HEADLINE_CAP);
  });

  it('never emits a headline longer than the cap', () => {
    for (const length of [149, 150, 151, 200, 1000]) {
      expect(truncateHeadline('ab '.repeat(length)).length).toBeLessThanOrEqual(
        HEADLINE_CAP,
      );
    }
  });
});

describe('getHeadlineSize', () => {
  it.each([
    [19, 92],
    [48, 92],
    [49, 78],
    [72, 78],
    [73, 68],
    [96, 68],
    [97, 58],
    [HEADLINE_CAP, 58],
  ])('sizes a %i-character headline at %ipx', (length, expected) => {
    expect(getHeadlineSize('a'.repeat(length))).toBe(expected);
  });

  it('never drops below the size the longest allowed headline was verified at', () => {
    const longest = truncateHeadline('lorem ipsum dolor '.repeat(40));

    expect(getHeadlineSize(longest)).toBe(58);
  });
});
