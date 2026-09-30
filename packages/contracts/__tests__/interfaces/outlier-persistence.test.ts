import { describe, expect, it } from 'vitest';
import { outlierConfigurationSchema } from '../../src/interfaces/analytics/outlier-persistence.interface';

describe('outlier configuration contract', () => {
  it('resolves defaults without changing the fixed minimum', () => {
    expect(outlierConfigurationSchema.parse({})).toEqual({
      windowSize: 20,
      minimumSampleSize: 5,
      outlierThreshold: 3,
      breakoutThreshold: 10,
      maturityHoursByPlatform: {},
    });
  });
  it.each([
    { windowSize: 4 },
    { windowSize: 51 },
    { minimumSampleSize: 6 },
    { outlierThreshold: 0 },
    { outlierThreshold: 10 },
    { breakoutThreshold: Infinity },
    { maturityHoursByPlatform: { unknown: 24 } },
    { maturityHoursByPlatform: { twitter: -1 } },
    { maturityHoursByPlatform: { twitter: 0.5 } },
    { maturityHoursByPlatform: { twitter: Number.MAX_SAFE_INTEGER } },
  ])('rejects invalid settings %j', (value) => {
    expect(outlierConfigurationSchema.safeParse(value).success).toBe(false);
  });
  it('accepts a zero-hour maturity override', () => {
    expect(
      outlierConfigurationSchema.parse({
        maturityHoursByPlatform: { twitter: 0 },
      }).maturityHoursByPlatform.twitter,
    ).toBe(0);
  });
});
