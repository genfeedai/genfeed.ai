import { normalizeProviderVideoDuration } from '@api/services/prompt-builder/builders/replicate/provider-video-duration.util';
import {
  getModelDurationsForResolution,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { REVIEWED_RATE_SHEET_ENTRIES } from '@genfeedai/pricing';
import { describe, expect, it } from 'vitest';

const HAILUO_MODEL_KEYS = [
  MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
  MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
];

describe('normalizeProviderVideoDuration', () => {
  it.each(HAILUO_MODEL_KEYS)(
    'runs %s at 6 s on 1080p, the length Replicate caps that resolution at',
    (modelKey) => {
      expect(normalizeProviderVideoDuration(modelKey, 10, '1080p')).toBe(6);
      expect(normalizeProviderVideoDuration(modelKey, 5, '1080p')).toBe(6);
      expect(normalizeProviderVideoDuration(modelKey, undefined, '1080p')).toBe(
        6,
      );
    },
  );

  it.each(HAILUO_MODEL_KEYS)(
    'keeps both lengths for %s on 768p or without a resolution',
    (modelKey) => {
      expect(normalizeProviderVideoDuration(modelKey, 10, '768p')).toBe(10);
      expect(normalizeProviderVideoDuration(modelKey, 10)).toBe(10);
      expect(normalizeProviderVideoDuration(modelKey, 5, '768p')).toBe(6);
    },
  );

  it('leaves a model without a fixed-length rule unchanged', () => {
    expect(
      normalizeProviderVideoDuration('test/unruled-model', 7, '1080p'),
    ).toBe(7);
  });

  it('agrees with the reviewed Hailuo 2.3 Fast rates on which lengths each resolution runs', () => {
    const entry = REVIEWED_RATE_SHEET_ENTRIES.find(
      (candidate) =>
        candidate.endpoint === MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    );
    if (!entry) throw new Error('The sheet must carry hailuo-2.3-fast');
    const resolutions = new Set(
      entry.rates.map((rate) => String(rate.when.resolution)),
    );
    for (const resolution of resolutions) {
      const priced = entry.rates
        .filter((rate) => rate.when.resolution === resolution)
        .map((rate) => Number(rate.when.duration))
        .sort((a, b) => a - b);
      expect(
        [
          ...getModelDurationsForResolution(
            MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
            resolution,
          ),
        ].sort((a, b) => a - b),
      ).toEqual(priced);
    }
  });
});
