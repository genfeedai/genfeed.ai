import {
  describeVariationRejections,
  filterSourcePostVariations,
} from '@api/collections/posts/services/source-post-variation-output.util';

describe('source post variation output filter', () => {
  const source =
    'Teams ship better content when research, writing, review, and publishing share one operating system.';

  it('rejects normalized verbatim reproduction', () => {
    const result = filterSourcePostVariations(
      [
        `  TEAMS ship better content when research, writing, review and publishing share one operating system!!!  `,
      ],
      source,
      'linkedin',
    );

    expect(result.accepted).toEqual([]);
    expect(result.rejected['source-reproduction']).toBe(1);
  });

  it('keeps distinct variations and never pads a duplicate', () => {
    const result = filterSourcePostVariations(
      [
        'A contrarian case for one connected content workflow.',
        'A contrarian case for one connected content workflow!',
        'A founder story about turning scattered research into a publishing habit.',
      ],
      source,
      'linkedin',
    );

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected.duplicate).toBe(1);
  });

  it('rejects outputs beyond the canonical platform limit', () => {
    const result = filterSourcePostVariations(
      [`${'x'.repeat(281)}`],
      source,
      'twitter',
    );

    expect(result.accepted).toEqual([]);
    expect(result.rejected['platform-limit']).toBe(1);
  });

  it('reports actual count and rejection reasons for partial success', () => {
    expect(
      describeVariationRejections(3, 1, {
        duplicate: 1,
        empty: 0,
        'platform-limit': 0,
        'source-reproduction': 1,
      }),
    ).toBe('Generated 1 of 3: 1 source reproduction, 1 duplicate.');
  });
});
