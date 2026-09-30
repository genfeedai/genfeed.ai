import { describe, expect, it } from 'vitest';
import { resolveBillableProviderCost } from './live-model-pricing';

describe('strict bill-time provider units', () => {
  const metered = {
    providerCostUsd: 0.24,
    pricingType: 'per-second',
    defaultDuration: 10,
  };
  it('bills actual avatar duration, not the ten-second display sample', () => {
    expect(resolveBillableProviderCost(metered, { duration: 90 })).toBe(
      21.599999999999998,
    );
    expect(resolveBillableProviderCost(metered, {})).toBeNull();
  });
  it.each([0, -1, Infinity, NaN])('rejects invalid duration %s', (duration) => {
    expect(resolveBillableProviderCost(metered, { duration })).toBeNull();
  });
  it('requires explicit megapixel dimensions and counts all outputs', () => {
    const model = { providerCostUsd: 0.02, pricingType: 'per-megapixel' };
    expect(
      resolveBillableProviderCost(model, {
        width: 2000,
        height: 1500,
        outputs: 4,
      }),
    ).toBe(0.24);
    expect(resolveBillableProviderCost(model, {})).toBeNull();
    expect(
      resolveBillableProviderCost(model, { width: Infinity, height: 1024 }),
    ).toBeNull();
  });
  it('unknown units and absent tariffs cannot become flat/free quotes', () => {
    expect(
      resolveBillableProviderCost(
        { providerCostUsd: 0.1, pricingType: 'per-character' },
        {},
      ),
    ).toBeNull();
    expect(resolveBillableProviderCost({}, {})).toBeNull();
    expect(resolveBillableProviderCost({ providerCostUsd: 0 }, {})).toBeNull();
    expect(
      resolveBillableProviderCost({ providerCostUsd: 0, isFree: true }, {}),
    ).toBe(0);
  });
  it('counts requests separately from outputs', () => {
    const request = { providerCostUsd: 0.05, pricingType: 'per-request' };
    expect(resolveBillableProviderCost(request, { outputs: 4 })).toBe(0.05);
    expect(
      resolveBillableProviderCost(request, { outputs: 4, requests: 2 }),
    ).toBe(0.1);
    expect(resolveBillableProviderCost(request, { requests: 0 })).toBeNull();
  });
  it('batching does not waive output charges', () => {
    expect(
      resolveBillableProviderCost(
        { providerCostUsd: 0.05, pricingType: 'flat' },
        { outputs: 4 },
      ),
    ).toBe(0.2);
    expect(
      resolveBillableProviderCost({ providerCostUsd: 0.05 }, { outputs: -2 }),
    ).toBeNull();
  });
});
