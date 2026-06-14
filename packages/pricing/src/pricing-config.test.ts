import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPricingConfig } from './pricing-config';

describe('getPricingConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GENFEED_BASE_COST_PER_CREDIT;
    delete process.env.GENFEED_MARGIN_MULTIPLIER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the documented defaults when env vars are absent', () => {
    const config = getPricingConfig();
    expect(config.baseCostPerCredit).toBe(0.005);
    expect(config.marginMultiplier).toBe(1.0);
  });

  it('reads valid numeric env vars', () => {
    process.env.GENFEED_BASE_COST_PER_CREDIT = '0.01';
    process.env.GENFEED_MARGIN_MULTIPLIER = '2.5';
    const config = getPricingConfig();
    expect(config.baseCostPerCredit).toBe(0.01);
    expect(config.marginMultiplier).toBe(2.5);
  });

  it('falls back to default when baseCostPerCredit env var is malformed (NaN)', () => {
    process.env.GENFEED_BASE_COST_PER_CREDIT = 'not-a-number';
    const config = getPricingConfig();
    expect(config.baseCostPerCredit).toBe(0.005);
  });

  it('falls back to default when marginMultiplier env var is malformed (NaN)', () => {
    process.env.GENFEED_MARGIN_MULTIPLIER = 'bad';
    const config = getPricingConfig();
    expect(config.marginMultiplier).toBe(1.0);
  });

  it('falls back to default when env var is an empty string', () => {
    process.env.GENFEED_BASE_COST_PER_CREDIT = '';
    process.env.GENFEED_MARGIN_MULTIPLIER = '';
    const config = getPricingConfig();
    expect(config.baseCostPerCredit).toBe(0.005);
    expect(config.marginMultiplier).toBe(1.0);
  });

  it('falls back to default when env var is Infinity', () => {
    process.env.GENFEED_BASE_COST_PER_CREDIT = 'Infinity';
    process.env.GENFEED_MARGIN_MULTIPLIER = '-Infinity';
    const config = getPricingConfig();
    expect(config.baseCostPerCredit).toBe(0.005);
    expect(config.marginMultiplier).toBe(1.0);
  });
});
