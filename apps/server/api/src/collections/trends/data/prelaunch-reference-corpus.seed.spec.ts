import { buildPrelaunchReferenceCorpusSeeds } from '@api/collections/trends/data/prelaunch-reference-corpus.seed';

describe('prelaunch reference corpus seed', () => {
  it('classifies organic source previews as public platform references', () => {
    const seeds = buildPrelaunchReferenceCorpusSeeds(
      new Date('2026-06-09T00:00:00.000Z'),
    );
    const organicSeeds = seeds.filter(
      (seed) => seed.metadata.launchCorpusSlice === 'organic-reference',
    );

    expect(seeds).toHaveLength(70);
    expect(organicSeeds).toHaveLength(63);
    expect(
      organicSeeds.every(
        (seed) =>
          seed.metadata.sourceClassification.sourceKind ===
            'public_platform_reference' &&
          seed.metadata.sourceClassification.intendedUse ===
            'organic_trend_discovery',
      ),
    ).toBe(true);

    const sourceItems = organicSeeds.flatMap((seed) => seed.sourcePreview);
    expect(sourceItems).toHaveLength(126);
    expect(
      sourceItems.every(
        (item) =>
          item.sourceClassification?.sourceKind ===
            'public_platform_reference' &&
          item.sourceClassification.intendedUse === 'organic_trend_discovery' &&
          item.sourceClassification.platform === item.platform &&
          typeof item.sourceClassification.sourceAuthor === 'string' &&
          typeof item.sourceClassification.sourceLabel === 'string' &&
          typeof item.sourceClassification.sourceTimestamp === 'string' &&
          typeof item.sourceClassification.sourceTopic === 'string',
      ),
    ).toBe(true);
    expect(
      organicSeeds.find((seed) => seed.platform === 'tiktok')?.metadata
        .sourceClassification.freshnessWindowDays,
    ).toBe(2);
    expect(
      organicSeeds.find((seed) => seed.platform === 'pinterest')?.metadata
        .sourceClassification.freshnessWindowDays,
    ).toBe(30);
  });

  it('keeps paid creative corpus references out of organic classification', () => {
    const seeds = buildPrelaunchReferenceCorpusSeeds(
      new Date('2026-06-09T00:00:00.000Z'),
    );
    const paidCreativeSeeds = seeds.filter(
      (seed) => seed.metadata.launchCorpusSlice === 'paid-creative-reference',
    );

    expect(paidCreativeSeeds).toHaveLength(7);
    expect(
      paidCreativeSeeds.every(
        (seed) =>
          seed.metadata.sourceClassification.sourceKind ===
            'paid_creative_reference' &&
          seed.metadata.sourceClassification.intendedUse ===
            'paid_creative_analysis' &&
          seed.metadata.sourceClassification.freshnessWindowDays === 14 &&
          seed.metadata.sourceClassification.paidCreative?.provider ===
            'manual_paid_reference',
      ),
    ).toBe(true);

    const sourceItems = paidCreativeSeeds.flatMap((seed) => seed.sourcePreview);
    expect(sourceItems).toHaveLength(14);
    expect(
      sourceItems.every(
        (item) =>
          item.sourceClassification?.sourceKind === 'paid_creative_reference' &&
          item.sourceClassification.intendedUse === 'paid_creative_analysis' &&
          item.sourceClassification.platform === item.platform &&
          item.sourceClassification.paidCreative?.provider ===
            'manual_paid_reference' &&
          typeof item.sourceClassification.sourceAuthor === 'string',
      ),
    ).toBe(true);
  });

  it('keeps organic LinkedIn seeds in the public-reference path', () => {
    const seeds = buildPrelaunchReferenceCorpusSeeds(
      new Date('2026-06-09T00:00:00.000Z'),
    );
    const linkedInSeeds = seeds.filter(
      (seed) =>
        seed.platform === 'linkedin' &&
        seed.metadata.launchCorpusSlice === 'organic-reference',
    );

    expect(linkedInSeeds).toHaveLength(9);
    expect(
      linkedInSeeds.every((seed) =>
        seed.sourcePreview.every(
          (item) =>
            item.platform === 'linkedin' &&
            item.sourceClassification?.platform === 'linkedin' &&
            item.sourceClassification.sourceAuthor?.startsWith('linkedin-') &&
            item.sourceClassification?.sourceLabel === 'LinkedIn' &&
            item.sourceClassification.confidence !== undefined,
        ),
      ),
    ).toBe(true);
  });
});
