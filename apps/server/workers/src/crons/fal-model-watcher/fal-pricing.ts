import { PricingType } from '@genfeedai/enums';

export interface NormalizedFalPrice {
  conditionalDimensions: Record<string, unknown>;
  currency: string;
  endpoint: string;
  unit: string;
  unitPrice: string;
}

export type FalPricingMapping =
  | {
      pricingType: PricingType;
      providerCostUsd: number;
      supported: true;
      unitPriceMicros: bigint;
    }
  | { reason: string; supported: false };

const CANONICAL_FIELDS = new Set([
  'currency',
  'endpoint_id',
  'unit',
  'unit_price',
]);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Fal pricing is missing ${field}`);
  }
  return value.trim();
}

function exactDecimal(value: unknown): string {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(value);
  }
  throw new Error('Fal pricing has an invalid unit_price');
}

export function normalizeFalPrice(
  raw: Record<string, unknown>,
): NormalizedFalPrice {
  return {
    conditionalDimensions: Object.fromEntries(
      Object.entries(raw)
        .filter(([key]) => !CANONICAL_FIELDS.has(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    currency: requiredString(raw.currency, 'currency'),
    endpoint: requiredString(raw.endpoint_id, 'endpoint_id'),
    unit: requiredString(raw.unit, 'unit'),
    unitPrice: exactDecimal(raw.unit_price),
  };
}

export function decimalUsdToMicros(value: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new Error(`Invalid non-negative decimal USD value: ${value}`);
  }
  const whole = BigInt(match[1] as string);
  const fraction = match[2] ?? '';
  const micros = BigInt(fraction.slice(0, 6).padEnd(6, '0'));
  const roundUp = Number(fraction[6] ?? '0') >= 5;
  return whole * 1_000_000n + micros + (roundUp ? 1n : 0n);
}

function canonicalUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replaceAll(/[-\s]+/g, '_');
}

export function mapFalPricing(price: NormalizedFalPrice): FalPricingMapping {
  if (price.currency.toUpperCase() !== 'USD') {
    return {
      reason: `unsupported_currency:${price.currency}`,
      supported: false,
    };
  }
  if (Object.keys(price.conditionalDimensions).length > 0) {
    return { reason: 'conditional_pricing_requires_review', supported: false };
  }

  const unit = canonicalUnit(price.unit);
  const pricingType =
    unit === 'request'
      ? PricingType.PER_REQUEST
      : unit === 'image'
        ? PricingType.FLAT
        : ['second', 'video_second', 'second_of_video'].includes(unit)
          ? PricingType.PER_SECOND
          : unit === 'megapixel'
            ? PricingType.PER_MEGAPIXEL
            : null;
  if (!pricingType) {
    return { reason: `unsupported_unit:${unit}`, supported: false };
  }

  return {
    pricingType,
    providerCostUsd: Number(price.unitPrice),
    supported: true,
    unitPriceMicros: decimalUsdToMicros(price.unitPrice),
  };
}
