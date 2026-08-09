import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPricingConfig } from '../src/pricing-config';

describe('getPricingConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns defaults when env vars are unset', () => {
    vi.stubEnv('GENFEED_BASE_COST_PER_CREDIT', '');
    vi.stubEnv('GENFEED_MARGIN_MULTIPLIER', '');

    expect(getPricingConfig()).toEqual({
      baseCostPerCredit: 0.005,
      marginMultiplier: 1.0,
    });
  });

  it('reads overrides from the environment', () => {
    vi.stubEnv('GENFEED_BASE_COST_PER_CREDIT', '0.01');
    vi.stubEnv('GENFEED_MARGIN_MULTIPLIER', '1.5');

    expect(getPricingConfig()).toEqual({
      baseCostPerCredit: 0.01,
      marginMultiplier: 1.5,
    });
  });
});
