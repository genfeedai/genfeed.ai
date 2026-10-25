import { describe, expect, it } from 'vitest';
import { clipperHighlightDetectionSchema } from '../../src/api-types/contracts/clipper-highlight-detection.contract';

const valid = {
  highlights: [
    {
      start_time: 0,
      end_time: 15,
      title: ' T ',
      summary: ' S ',
      virality_score: 1,
      tags: [],
      clip_type: 'hook',
    },
  ],
};
describe('clipper-highlight-detection', () => {
  it('accepts domain data and trims required strings', () =>
    expect(clipperHighlightDetectionSchema.safeParse(valid).success).toBe(
      true,
    ));
  it('rejects each missing required field', () => {
    const value: Record<string, unknown> = { ...valid.highlights[0] };
    const required = Object.keys(value);
    for (const key of required) {
      const incomplete = { ...value };
      delete incomplete[key];
      expect(
        clipperHighlightDetectionSchema.safeParse({ highlights: [incomplete] })
          .success,
      ).toBe(false);
    }
  });
  it('rejects missing fields', () =>
    expect(clipperHighlightDetectionSchema.safeParse({}).success).toBe(false));
  it('rejects unknown envelope keys', () =>
    expect(
      clipperHighlightDetectionSchema.safeParse({ ...valid, extra: true })
        .success,
    ).toBe(false));
  it.each([
    { start_time: -1 },
    { start_time: Infinity },
    { end_time: -1 },
    { end_time: Infinity },
    { end_time: 14.99 },
    { end_time: 90.01 },
    { title: ' ' },
    { title: 'x'.repeat(61) },
    { summary: '' },
    { virality_score: 0 },
    { virality_score: 101 },
    { virality_score: Infinity },
    { tags: [' '] },
    { clip_type: 'invalid' },
    { extra: 1 },
    { start_time: '0' },
    { end_time: null },
  ])('rejects invalid field %j', (invalid) =>
    expect(
      clipperHighlightDetectionSchema.safeParse({
        highlights: [{ ...valid.highlights[0], ...invalid }],
      }).success,
    ).toBe(false),
  );
  it('accepts an empty envelope', () =>
    expect(clipperHighlightDetectionSchema.parse({ highlights: [] })).toEqual({
      highlights: [],
    }));
  it('accepts inclusive duration and score bounds', () =>
    expect(
      clipperHighlightDetectionSchema.safeParse({
        highlights: [
          { ...valid.highlights[0], end_time: 90, virality_score: 100 },
        ],
      }).success,
    ).toBe(true));
});
