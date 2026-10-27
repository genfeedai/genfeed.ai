import { SELF_HOSTED_MODELS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { findReviewedRateSheetEntry, UNPRICED_MODELS } from './index';

interface CuratedRateRow {
  endpoint?: string;
  key: string;
  provider: string;
  providerCostUsd?: number;
}

/**
 * Rows whose configured `providerCostUsd` sits below every reviewed rate for
 * the same unit. Each is a pricing decision, not a refactor: the constant is
 * not changed here, and the row leaves this list when the constant is deleted
 * or the rate is deliberately updated (#7991).
 */
const KNOWN_BELOW_REVIEWED_RATES: Readonly<Record<string, string>> = {
  'google/nano-banana-2':
    'Configured $0.039 is below the reviewed $0.067-$0.151 per output.',
  'google/nano-banana-pro':
    'Configured $0.134 is below the reviewed $0.15-$0.30 per output.',
};

/** Voice rows are configured per call but the reviewed rate is per character. */
const PER_CHARACTER_UNIT = 'character';

const rows = (SELF_HOSTED_MODELS as readonly CuratedRateRow[]).filter(
  (row) => typeof row.providerCostUsd === 'number',
);

describe('curated provider rates against the reviewed rate sheet (#7991)', () => {
  it('prices every curated rate row from the sheet or lists it as unpriced', () => {
    const missing: string[] = [];
    for (const row of rows) {
      const endpoint = row.endpoint ?? row.key;
      if (findReviewedRateSheetEntry(row.provider, endpoint)) continue;
      // Replicate endpoints can carry a version hash after the model name.
      if (UNPRICED_MODELS[endpoint.split(':')[0]]) continue;
      missing.push(`${row.provider}:${endpoint}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps each configured rate inside the reviewed range for the same unit', () => {
    const outside: string[] = [];
    for (const row of rows) {
      const endpoint = row.endpoint ?? row.key;
      const entry = findReviewedRateSheetEntry(row.provider, endpoint);
      if (!entry || row.providerCostUsd === undefined) continue;
      const comparable = entry.rates.filter(
        (rate) => rate.unit !== PER_CHARACTER_UNIT,
      );
      if (comparable.length === 0) continue;
      const prices = comparable.map((rate) => rate.unitPriceUsd);
      const isInRange =
        row.providerCostUsd >= Math.min(...prices) - 1e-9 &&
        row.providerCostUsd <= Math.max(...prices) + 1e-9;
      if (!isInRange && !KNOWN_BELOW_REVIEWED_RATES[endpoint])
        outside.push(`${row.provider}:${endpoint} ${row.providerCostUsd}`);
    }
    expect(outside).toEqual([]);
  });

  it('removes a known divergence from the list once the rate is back in range', () => {
    for (const endpoint of Object.keys(KNOWN_BELOW_REVIEWED_RATES)) {
      const row = rows.find(
        (candidate) => (candidate.endpoint ?? candidate.key) === endpoint,
      );
      const entry = findReviewedRateSheetEntry('replicate', endpoint);
      if (!row || !entry || row.providerCostUsd === undefined)
        throw new Error(`stale divergence entry ${endpoint}`);
      expect(row.providerCostUsd).toBeLessThan(
        Math.min(...entry.rates.map((rate) => rate.unitPriceUsd)),
      );
    }
  });
});
