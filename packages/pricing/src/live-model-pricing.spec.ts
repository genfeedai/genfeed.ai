import { PricingType } from '@genfeedai/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  billCreditsFromProviderCost,
  buildPricingAuditStamp,
  computeMediaVendorCostMicros,
  resolveLiveModelCreditPricing,
  resolveProviderCostUnits,
  withLiveModelCreditPricing,
} from './live-model-pricing';
import { applyMargin, setRuntimeMarginMultiplier } from './plans-pricing';

describe('live model credit pricing', () => {
  afterEach(() => {
    setRuntimeMarginMultiplier(1);
  });

  it('returns stored credits when providerCostUsd is missing', () => {
    expect(
      resolveLiveModelCreditPricing({
        cost: 12,
        costPerUnit: 3,
        minCost: 2,
      }),
    ).toEqual({ cost: 12, costPerUnit: 3, minCost: 2 });
  });

  it('computes FLAT cost from providerCostUsd × live margin', () => {
    setRuntimeMarginMultiplier(1);
    const live = resolveLiveModelCreditPricing({
      cost: 999,
      pricingType: PricingType.FLAT,
      providerCostUsd: 0.15,
    });
    expect(live.cost).toBe(applyMargin(0.15, 1));
    expect(live.costPerUnit).toBeNull();
    expect(live.minCost).toBe(applyMargin(0.15, 1));

    setRuntimeMarginMultiplier(1.2);
    expect(
      resolveLiveModelCreditPricing({
        pricingType: PricingType.FLAT,
        providerCostUsd: 0.15,
      }).cost,
    ).toBe(applyMargin(0.15, 1.2));
  });

  it('computes PER_SECOND unit and default-run costs', () => {
    setRuntimeMarginMultiplier(1);
    const live = resolveLiveModelCreditPricing({
      defaultDuration: 5,
      pricingType: PricingType.PER_SECOND,
      providerCostUsd: 0.24,
    });
    expect(live.costPerUnit).toBe(applyMargin(0.24, 1));
    expect(live.cost).toBe(applyMargin(0.24 * 5, 1));
    expect(live.minCost).toBe(applyMargin(0.24, 1));
  });

  it('billCreditsFromProviderCost scales by request duration', () => {
    setRuntimeMarginMultiplier(1);
    expect(
      billCreditsFromProviderCost(
        {
          defaultDuration: 5,
          pricingType: PricingType.PER_SECOND,
          providerCostUsd: 0.24,
        },
        { duration: 10 },
      ),
    ).toBe(applyMargin(2.4, 1));
  });

  it('resolveProviderCostUnits prefers explicit duration over default', () => {
    expect(
      resolveProviderCostUnits(PricingType.PER_SECOND, 5, { duration: 12 }),
    ).toBe(12);
    expect(resolveProviderCostUnits(PricingType.PER_SECOND, 5)).toBe(5);
    expect(resolveProviderCostUnits(PricingType.FLAT)).toBe(1);
  });

  it('buildPricingAuditStamp captures the runtime margin and model inputs', () => {
    setRuntimeMarginMultiplier(1.4);
    expect(
      buildPricingAuditStamp({
        pricingType: PricingType.PER_SECOND,
        providerCostUsd: 0.24,
      }),
    ).toEqual({
      marginMultiplier: 1.4,
      pricingType: PricingType.PER_SECOND,
      providerCostUsd: 0.24,
    });
  });

  it('buildPricingAuditStamp nulls legacy-priced models', () => {
    setRuntimeMarginMultiplier(1);
    expect(buildPricingAuditStamp({})).toEqual({
      marginMultiplier: 1,
      pricingType: null,
      providerCostUsd: null,
    });
    expect(
      buildPricingAuditStamp({ providerCostUsd: 0 }).providerCostUsd,
    ).toBeNull();
  });

  it('computeMediaVendorCostMicros scales provider USD by realized units', () => {
    // 10s × $0.24/s = $2.40 → 2_400_000 micro-USD
    expect(
      computeMediaVendorCostMicros(
        {
          defaultDuration: 5,
          pricingType: PricingType.PER_SECOND,
          providerCostUsd: 0.24,
        },
        { duration: 10 },
      ),
    ).toBe(2_400_000);
    // FLAT: one run at $0.15
    expect(
      computeMediaVendorCostMicros({
        pricingType: PricingType.FLAT,
        providerCostUsd: 0.15,
      }),
    ).toBe(150_000);
  });

  it('computeMediaVendorCostMicros returns 0 without a provider cost', () => {
    expect(computeMediaVendorCostMicros({ cost: 50 })).toBe(0);
    expect(computeMediaVendorCostMicros({ providerCostUsd: 0 })).toBe(0);
  });

  it('withLiveModelCreditPricing projects fields without dropping others', () => {
    setRuntimeMarginMultiplier(1);
    const row = withLiveModelCreditPricing({
      key: 'bytedance/seedance-2.5',
      label: 'Seedance 2.5',
      defaultDuration: 5,
      pricingType: PricingType.PER_SECOND,
      providerCostUsd: 0.24,
      cost: 1,
    });
    expect(row.key).toBe('bytedance/seedance-2.5');
    expect(row.providerCostUsd).toBe(0.24);
    expect(row.cost).toBe(applyMargin(1.2, 1));
    expect(row.costPerUnit).toBe(applyMargin(0.24, 1));
  });
});
