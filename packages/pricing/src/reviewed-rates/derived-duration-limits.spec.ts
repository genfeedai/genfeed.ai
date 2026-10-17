import type { ReviewedProviderRate } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { deriveDurationsByResolution } from './derived-duration-limits';
import { findReviewedRateSheetEntry } from './index';

function rate(when: ReviewedProviderRate['when']): ReviewedProviderRate {
  return { component: 'output', unit: 'output', unitPriceUsd: 0.1, when };
}

describe('deriveDurationsByResolution', () => {
  it('lists the priced durations per resolution, sorted and lowercased', () => {
    expect(
      deriveDurationsByResolution([
        rate({ duration: 10, resolution: '768P' }),
        rate({ duration: 6, resolution: '768p' }),
        rate({ duration: 6, resolution: '1080p' }),
      ]),
    ).toEqual({ '1080p': [6], '768p': [6, 10] });
  });

  it('ignores rates that do not pin both a resolution and a duration', () => {
    expect(
      deriveDurationsByResolution([
        rate({ resolution: '720p' }),
        rate({ duration: 5 }),
        { ...rate({ resolution: '480p' }), unit: 'second' },
      ]),
    ).toBeUndefined();
  });

  it('returns undefined without rates', () => {
    expect(deriveDurationsByResolution(null)).toBeUndefined();
    expect(deriveDurationsByResolution([])).toBeUndefined();
  });

  it('reads the reviewed Hailuo 2.3 Fast sheet: 1080p runs 6 seconds only', () => {
    const entry = findReviewedRateSheetEntry(
      'replicate',
      'minimax/hailuo-2.3-fast',
    );
    expect(deriveDurationsByResolution(entry?.rates)).toEqual({
      '1080p': [6],
      '768p': [6, 10],
    });
  });
});
