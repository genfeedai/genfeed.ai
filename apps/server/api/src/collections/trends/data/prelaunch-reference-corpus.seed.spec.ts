import { buildPrelaunchReferenceCorpusSeeds } from '@api/collections/trends/data/prelaunch-reference-corpus.seed';

describe('prelaunch reference corpus seed', () => {
  it('classifies every source preview as a public platform reference', () => {
    const seeds = buildPrelaunchReferenceCorpusSeeds(
      new Date('2026-06-09T00:00:00.000Z'),
    );

    expect(seeds).toHaveLength(70);
    expect(
      seeds.every(
        (seed) =>
          seed.metadata.sourceClassification.sourceKind ===
            'public_platform_reference' &&
          seed.metadata.sourceClassification.intendedUse ===
            'organic_trend_discovery',
      ),
    ).toBe(true);

    const sourceItems = seeds.flatMap((seed) => seed.sourcePreview);
    expect(sourceItems).toHaveLength(140);
    expect(
      sourceItems.every(
        (item) =>
          item.sourceClassification?.sourceKind ===
            'public_platform_reference' &&
          item.sourceClassification.intendedUse === 'organic_trend_discovery' &&
          typeof item.sourceClassification.sourceLabel === 'string' &&
          typeof item.sourceClassification.sourceTopic === 'string',
      ),
    ).toBe(true);
  });

  it('keeps LinkedIn in the same public-reference path as other platforms', () => {
    const seeds = buildPrelaunchReferenceCorpusSeeds(
      new Date('2026-06-09T00:00:00.000Z'),
    );
    const linkedInSeeds = seeds.filter((seed) => seed.platform === 'linkedin');

    expect(linkedInSeeds).toHaveLength(10);
    expect(
      linkedInSeeds.every((seed) =>
        seed.sourcePreview.every(
          (item) =>
            item.platform === 'linkedin' &&
            item.sourceClassification?.sourceLabel === 'LinkedIn' &&
            item.sourceClassification.confidence !== undefined,
        ),
      ),
    ).toBe(true);
  });
});
