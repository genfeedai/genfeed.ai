import { ContentFormat } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  batchItemCredits,
  chargeBatchGenerationCredits,
  estimateBatchGenerationCredits,
} from './batch-generation-pricing.constant';

describe('batch-generation-pricing', () => {
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
});
