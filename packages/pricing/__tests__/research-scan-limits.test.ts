import { SubscriptionTier } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  describeResearchScans,
  formatResearchScanLimit,
  getResearchScanLimitForTier,
  RESEARCH_SCAN_LIMITS,
} from '../src/research-scan-limits';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('RESEARCH_SCAN_LIMITS', () => {
  it('covers every SubscriptionTier', () => {
    expect(Object.keys(RESEARCH_SCAN_LIMITS).sort()).toEqual(
      Object.values(SubscriptionTier).sort(),
    );
  });

  it('gives no plan one scan a week, Pro 5 a day, Scale 25 a day, and done-for-you no limit', () => {
    expect(getResearchScanLimitForTier(SubscriptionTier.FREE)).toEqual({
      maxScans: 1,
      windowMs: 7 * DAY_MS,
    });
    expect(getResearchScanLimitForTier(SubscriptionTier.PRO)).toEqual({
      maxScans: 5,
      windowMs: DAY_MS,
    });
    expect(getResearchScanLimitForTier(SubscriptionTier.SCALE)).toEqual({
      maxScans: 25,
      windowMs: DAY_MS,
    });
    expect(getResearchScanLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });

  it.each([null, undefined, '', 'unknown'])(
    'treats the unknown tier %j like no plan',
    (tier) => {
      expect(getResearchScanLimitForTier(tier)).toEqual(
        RESEARCH_SCAN_LIMITS[SubscriptionTier.FREE],
      );
    },
  );
});

describe('formatResearchScanLimit', () => {
  it('words each tier the way the pricing page does', () => {
    expect(
      Object.values(SubscriptionTier).map((tier) =>
        formatResearchScanLimit(getResearchScanLimitForTier(tier)),
      ),
    ).toEqual(['1 a week', '5 a day', '25 a day', 'Unlimited']);
  });
});

describe('describeResearchScans', () => {
  it('words the scans of each tier as one sentence', () => {
    expect(
      Object.values(SubscriptionTier).map((tier) =>
        describeResearchScans(tier),
      ),
    ).toEqual([
      '1 trend scan and 1 competitor ad scan a week',
      '5 trend scans and 5 competitor ad scans a day',
      '25 trend scans and 25 competitor ad scans a day',
      'Unlimited trend and competitor ad scans',
    ]);
  });
});
