import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PricingType } from '@genfeedai/contracts';
import {
  decimalUsdToMicros,
  mapFalPricing,
  normalizeFalPrice,
} from '@workers/crons/fal-model-watcher/fal-pricing';

const fixtureDir = fileURLToPath(
  new URL('../../../test/fixtures/fal/', import.meta.url),
);
const pricingFixture = JSON.parse(
  readFileSync(join(fixtureDir, 'pricing.json'), 'utf8'),
) as { prices: Array<Record<string, unknown>> };

describe('Fal pricing contracts', () => {
  it('preserves endpoint, currency, unit, exact amount, and conditional dimensions', () => {
    const conditional = pricingFixture.prices.find(
      (price) => price.endpoint_id === 'fal-ai/conditional-image',
    );

    expect(normalizeFalPrice(conditional as Record<string, unknown>)).toEqual({
      conditionalDimensions: {
        conditions: { resolution: '4K', with_audio: false },
      },
      currency: 'USD',
      endpoint: 'fal-ai/conditional-image',
      unit: 'image',
      unitPrice: '0.15',
    });
  });

  it('preserves provider currency casing while mapping USD case-insensitively', () => {
    const normalized = normalizeFalPrice({
      currency: 'usd',
      endpoint_id: 'fal-ai/lowercase-currency',
      unit: 'image',
      unit_price: '0.0100',
    });

    expect(normalized.currency).toBe('usd');
    expect(normalized.unitPrice).toBe('0.0100');
    expect(mapFalPricing(normalized)).toMatchObject({ supported: true });
  });

  it.each([
    ['fal-ai/flat-request', PricingType.PER_REQUEST],
    ['fal-ai/per-image', PricingType.FLAT],
    ['fal-ai/per-second', PricingType.PER_SECOND],
    ['fal-ai/per-megapixel', PricingType.PER_MEGAPIXEL],
  ])('maps supported billing unit for %s', (endpoint, pricingType) => {
    const raw = pricingFixture.prices.find(
      (price) => price.endpoint_id === endpoint,
    );
    const mapping = mapFalPricing(
      normalizeFalPrice(raw as Record<string, unknown>),
    );

    expect(mapping).toMatchObject({
      pricingType,
      supported: true,
    });
  });

  it.each([
    ['fal-ai/per-token', 'unsupported_unit:token'],
    ['fal-ai/gpu-priced', 'unsupported_unit:gpu_second'],
    ['fal-ai/conditional-image', 'conditional_pricing_requires_review'],
  ])('quarantines %s deterministically', (endpoint, reason) => {
    const raw = pricingFixture.prices.find(
      (price) => price.endpoint_id === endpoint,
    );

    expect(
      mapFalPricing(normalizeFalPrice(raw as Record<string, unknown>)),
    ).toEqual({ reason, supported: false });
  });

  it('rounds exact decimal USD to micro-USD using half-up semantics', () => {
    expect(decimalUsdToMicros('0.025')).toBe(25_000n);
    expect(decimalUsdToMicros('0.0000004')).toBe(0n);
    expect(decimalUsdToMicros('0.0000005')).toBe(1n);
    expect(decimalUsdToMicros('12.3456789')).toBe(12_345_679n);
  });

  it('normalizes sub-micro numeric prices without exponential notation', () => {
    const normalized = normalizeFalPrice({
      currency: 'USD',
      endpoint_id: 'fal-ai/sub-micro',
      unit: 'image',
      unit_price: 4e-7,
    });

    expect(normalized.unitPrice).toBe('0.0000004');
    expect(mapFalPricing(normalized)).toEqual({
      reason: 'unit_price_below_minimum_precision',
      supported: false,
    });
  });
});
