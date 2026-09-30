import { describe, expect, it } from 'vitest';
import { ContentFormat } from '..';
import {
  allocateByWeights,
  batchItemCredits,
  chargeBatchGenerationCredits,
  estimateBatchGenerationCredits,
  reconcileBatchGenerationCredits,
  resolveBatchPricingOptions,
  sourcePostVariationCredits,
} from './batch-generation-pricing.constant';

describe('batch-generation-pricing', () => {
  it('uses identical per-output arithmetic for variation preview and charge', () => {
    expect(sourcePostVariationCredits(3)).toBe(3);
    expect(sourcePostVariationCredits(10)).toBe(10);
    expect(sourcePostVariationCredits(2.5)).toBe(0);
  });
  it('prices a caption draft lower than a video slot', () => {
    const image = batchItemCredits(
      { format: ContentFormat.IMAGE },
      { includeMedia: true, qualityTier: 'budget' },
    );
    const video = batchItemCredits(
      { format: ContentFormat.VIDEO },
      { includeMedia: true, qualityTier: 'budget' },
    );
    expect(video).toBeGreaterThan(image);
    expect(image).toBeGreaterThan(0);
  });

  it('scales caption cost with quality tier / chat model round credits', () => {
    const budget = batchItemCredits(
      { format: ContentFormat.IMAGE },
      { includeMedia: false, qualityTier: 'budget' },
    );
    const high = batchItemCredits(
      { format: ContentFormat.IMAGE },
      { includeMedia: false, qualityTier: 'high_quality' },
    );
    const expensiveModel = batchItemCredits(
      { format: ContentFormat.IMAGE },
      { chatModelRoundCredits: 12, includeMedia: false },
    );
    expect(high).toBeGreaterThan(budget);
    expect(expensiveModel).toBeGreaterThan(budget);
  });

  it('estimates 20 image-heavy posts higher than 20 pure packaging', () => {
    const withMedia = estimateBatchGenerationCredits(
      { count: 20 },
      { includeMedia: true, qualityTier: 'balanced' },
    );
    const captionOnly = estimateBatchGenerationCredits(
      { count: 20 },
      { includeMedia: false, qualityTier: 'balanced' },
    );
    expect(withMedia).toBeGreaterThan(captionOnly);
    // Not the old fake 20*1*10 = 200 for caption-only path.
    expect(captionOnly).toBeLessThan(200);
    expect(captionOnly).toBeGreaterThanOrEqual(20);
  });

  it('charges only completed items', () => {
    const total = chargeBatchGenerationCredits(
      [
        { format: ContentFormat.IMAGE, hasMedia: false },
        { format: ContentFormat.REEL, hasMedia: false },
      ],
      { includeMedia: false, qualityTier: 'budget' },
    );
    expect(total).toBe(
      batchItemCredits(
        { format: ContentFormat.IMAGE, hasMedia: false },
        { includeMedia: false, qualityTier: 'budget' },
      ) +
        batchItemCredits(
          { format: ContentFormat.REEL, hasMedia: false },
          { includeMedia: false, qualityTier: 'budget' },
        ),
    );
  });

  it('charges media rates for items that came back with media', () => {
    const options = resolveBatchPricingOptions({ hasMediaGeneration: false });
    const captionOnly = chargeBatchGenerationCredits(
      [{ format: ContentFormat.REEL, hasMedia: false }],
      options,
    );
    const withMedia = chargeBatchGenerationCredits(
      [{ format: ContentFormat.REEL, hasMedia: true }],
      options,
    );

    expect(withMedia).toBeGreaterThan(captionOnly);
  });

  it('resolves the same options for the estimate UI and the server charge', () => {
    const uiOptions = resolveBatchPricingOptions({ hasMediaGeneration: false });
    const serverOptions = resolveBatchPricingOptions({
      hasMediaGeneration: false,
      qualityTier: undefined,
    });

    expect(uiOptions).toEqual(serverOptions);
    expect(uiOptions.includeMedia).toBe(false);
    expect(uiOptions.qualityTier).toBe('balanced');
  });

  it('promotes batch-level media intent to media rates', () => {
    const captionOnly = resolveBatchPricingOptions({
      hasMediaGeneration: false,
    });
    const mediaRun = resolveBatchPricingOptions({ hasMediaGeneration: true });

    expect(
      batchItemCredits({ format: ContentFormat.VIDEO }, mediaRun),
    ).toBeGreaterThan(
      batchItemCredits({ format: ContentFormat.VIDEO }, captionOnly),
    );
  });

  it('bills the shortfall when an async batch produced media', () => {
    const options = resolveBatchPricingOptions({ hasMediaGeneration: false });
    const items = [
      { format: ContentFormat.IMAGE, hasMedia: true },
      { format: ContentFormat.IMAGE, hasMedia: true },
    ];
    const estimate = chargeBatchGenerationCredits(
      items.map((item) => ({ ...item, hasMedia: false })),
      options,
    );

    const settlement = reconcileBatchGenerationCredits(
      estimate,
      items,
      options,
    );

    expect(settlement.settledCredits).toBeGreaterThan(estimate);
    expect(settlement.additionalCredits).toBe(
      settlement.settledCredits - estimate,
    );
    expect(settlement.refundCredits).toBe(0);
  });

  it('refunds the estimate when an async batch landed nothing', () => {
    const options = resolveBatchPricingOptions({ hasMediaGeneration: false });

    const settlement = reconcileBatchGenerationCredits(25, [], options);

    expect(settlement.settledCredits).toBe(0);
    expect(settlement.refundCredits).toBe(25);
    expect(settlement.additionalCredits).toBe(0);
  });

  it('settles to zero when the estimate already matched the outcome', () => {
    const options = resolveBatchPricingOptions({ hasMediaGeneration: false });
    const items = [{ format: ContentFormat.IMAGE, hasMedia: false }];
    const estimate = chargeBatchGenerationCredits(items, options);

    const settlement = reconcileBatchGenerationCredits(
      estimate,
      items,
      options,
    );

    expect(settlement.additionalCredits).toBe(0);
    expect(settlement.refundCredits).toBe(0);
  });

  it('allocates non-negative weights so counts sum exactly to total', () => {
    const counts = allocateByWeights(10, {
      image: 60,
      video: 25,
      carousel: 10,
      reel: 5,
      story: 0,
    });
    const sum = Object.values(counts).reduce((acc, n) => acc + n, 0);
    expect(sum).toBe(10);
    expect(counts.story).toBe(0);
  });

  it('clamps negative weights and never overshoots total', () => {
    const counts = allocateByWeights(7, {
      image: -40,
      video: 50,
      reel: 50,
    });
    expect(Object.values(counts).reduce((acc, n) => acc + n, 0)).toBe(7);
    expect(counts.image).toBe(0);
  });

  it('returns an empty map for an empty weight set', () => {
    expect(allocateByWeights(10, {})).toEqual({});
  });

  it('puts the full total on the first key when every weight is zero', () => {
    const counts = allocateByWeights(4, {
      image: 0,
      video: 0,
      reel: 0,
    });
    expect(counts).toEqual({ image: 4, video: 0, reel: 0 });
  });

  it('prices a one-item mixed mix as exactly one item', () => {
    const options = resolveBatchPricingOptions({ hasMediaGeneration: false });
    const estimate = estimateBatchGenerationCredits(
      {
        contentMix: {
          [ContentFormat.IMAGE]: 1,
          [ContentFormat.VIDEO]: 1,
          [ContentFormat.REEL]: 1,
          [ContentFormat.CAROUSEL]: 1,
          [ContentFormat.STORY]: 1,
        },
        count: 1,
      },
      options,
    );
    // Single largest remainder winner — never multiplies by every format.
    expect(estimate).toBe(
      batchItemCredits(
        { format: ContentFormat.IMAGE, hasMedia: false },
        options,
      ),
    );
  });
});
