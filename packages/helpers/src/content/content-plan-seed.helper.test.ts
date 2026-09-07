import { parsePlanSeedSummary } from '@helpers/content/content-plan-seed.helper';
import { describe, expect, it } from 'vitest';

describe('parsePlanSeedSummary', () => {
  it('reads a cold-start plan description', () => {
    expect(
      parsePlanSeedSummary(
        'AI-generated cold-start plan (seeded from competitor ads, creative patterns and followed creators; 3 own posts in the last 30 days): Launch Week',
      ),
    ).toEqual({
      kind: 'cold-start',
      seedSummary:
        'seeded from competitor ads, creative patterns and followed creators; 3 own posts in the last 30 days',
    });
  });

  it('reads a grounded plan description', () => {
    expect(
      parsePlanSeedSummary(
        'AI-generated plan (grounded in 12 own posts, 4 imported): Q3 Growth',
      ),
    ).toEqual({
      kind: 'grounded',
      seedSummary: 'grounded in 12 own posts, 4 imported',
    });
  });

  it('returns unknown for a missing or unrecognized description', () => {
    expect(parsePlanSeedSummary(undefined)).toEqual({ kind: 'unknown' });
    expect(parsePlanSeedSummary(null)).toEqual({ kind: 'unknown' });
    expect(parsePlanSeedSummary('A manually written plan')).toEqual({
      kind: 'unknown',
    });
  });

  it('handles a plan name containing a colon', () => {
    expect(
      parsePlanSeedSummary(
        'AI-generated plan (grounded in 0 own posts, 0 imported): Weekly: Recap',
      ),
    ).toEqual({
      kind: 'grounded',
      seedSummary: 'grounded in 0 own posts, 0 imported',
    });
  });
});
