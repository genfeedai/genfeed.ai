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

  it('truncates repeated emoji as complete Unicode code points', () => {
    const result = truncateHeadline('🚀'.repeat(12), 10);

    expect(result).toBe(`${'🚀'.repeat(9)}…`);
    expect(Array.from(result)).toHaveLength(10);
  });

  it('keeps an emoji whole when it lands at the truncation boundary', () => {
    expect(truncateHeadline('12345678🚀xy', 10)).toBe('12345678🚀…');
  });

  it('preserves the word-boundary policy for mixed text and emoji', () => {
    expect(truncateHeadline('Launch 🚀 update now please', 20)).toBe(
      'Launch 🚀 update…',
    );
  });

  it('falls back to a hard slice when there is no word break to back up to', () => {
    const result = truncateHeadline('x'.repeat(400));

    expect(result).toBe(`${'x'.repeat(HEADLINE_CAP - 1)}…`);
    expect(result.length).toBe(HEADLINE_CAP);
  });

  it('never emits a headline longer than the cap', () => {
    for (const length of [149, 150, 151, 200, 1000]) {
      const result = truncateHeadline('ab '.repeat(length));

      expect(Array.from(result).length).toBeLessThanOrEqual(HEADLINE_CAP);
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

  it('sizes emoji by Unicode code point count', () => {
    expect(getHeadlineSize('🚀'.repeat(48))).toBe(92);
    expect(getHeadlineSize('🚀'.repeat(49))).toBe(78);
  });

  it('never drops below the size the longest allowed headline was verified at', () => {
    const longest = truncateHeadline('lorem ipsum dolor '.repeat(40));

    expect(getHeadlineSize(longest)).toBe(58);
  });
});
