import { describe, expect, it } from 'vitest';
import { trendContentIdeasSchema } from '../../src/api-types/contracts/trend-content-ideas.contract';

const valid = {
  ideas: [
    {
      title: ' T ',
      description: ' D ',
      contentType: 'video',
      hashtags: null,
      caption: null,
      estimatedViews: null,
    },
  ],
};
describe('trend-content-ideas', () => {
  it('accepts domain data and trims required strings', () =>
    expect(trendContentIdeasSchema.safeParse(valid).success).toBe(true));
  it('rejects missing fields', () =>
    expect(trendContentIdeasSchema.safeParse({}).success).toBe(false));
  it('rejects unknown envelope keys', () =>
    expect(
      trendContentIdeasSchema.safeParse({ ...valid, extra: true }).success,
    ).toBe(false));
  it.each([
    { title: '' },
    { description: ' ' },
    { contentType: 'invalid' },
    { hashtags: [''] },
    { caption: ' ' },
    { estimatedViews: '10K-50K' },
    { estimatedViews: -1 },
    { estimatedViews: Infinity },
    { extra: 1 },
  ])('rejects invalid field %j', (invalid) =>
    expect(
      trendContentIdeasSchema.safeParse({
        ideas: [{ ...valid.ideas[0], ...invalid }],
      }).success,
    ).toBe(false),
  );
  it('accepts an empty envelope', () =>
    expect(trendContentIdeasSchema.parse({ ideas: [] })).toEqual({
      ideas: [],
    }));
  it('accepts numeric estimates and omitted optionals', () =>
    expect(
      trendContentIdeasSchema.parse({
        ideas: [
          {
            title: 'T',
            description: 'D',
            contentType: 'text',
            estimatedViews: 0,
          },
        ],
      }).ideas[0].estimatedViews,
    ).toBe(0));
});
