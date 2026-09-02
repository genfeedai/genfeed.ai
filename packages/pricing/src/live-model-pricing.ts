import { PricingType } from '@genfeedai/contracts';
import type { CreditsPricingMetadata } from '@genfeedai/contracts/interfaces';

import { applyMargin, getRuntimeMarginMultiplier } from './plans-pricing';

/**
 * Fields needed to compute customer-facing credits from raw provider USD.
 * Prefer `providerCostUsd` + live `applyMargin` over baked credit columns.
 */
export type ModelLivePricingInput = {
  cost?: number | null;
  costPerUnit?: number | null;
  defaultDuration?: number | null;
  minCost?: number | null;
  pricingType?: string | null;
  providerCostUsd?: number | null;
};

/** Virtual credit fields projected onto a model row for UI / clients. */
export type ModelLiveCreditPricing = {
  cost: number;
  costPerUnit: number | null;
  minCost: number | null;
};

export type ModelLivePricingUnits = {
  duration?: number;
  height?: number;
  width?: number;
};

/**
 * How many provider-cost units a request consumes.
 * `providerCostUsd` is USD **per unit** for the active pricingType:
 * - FLAT → 1 (per run)
 * - PER_SECOND → seconds (duration / defaultDuration / 1)
 * - PER_MEGAPIXEL → megapixels when width×height known, else 1
 */
export function resolveProviderCostUnits(
  pricingType: string | null | undefined,
  defaultDuration?: number | null,
  options?: ModelLivePricingUnits,
): number {
  const type = pricingType || PricingType.FLAT;

  if (type === PricingType.PER_SECOND) {
    if (typeof options?.duration === 'number' && options.duration > 0) {
      return options.duration;
    }
    if (typeof defaultDuration === 'number' && defaultDuration > 0) {
      return defaultDuration;
    }
    return 1;
  }

  if (
    type === PricingType.PER_MEGAPIXEL &&
    typeof options?.width === 'number' &&
    typeof options?.height === 'number' &&
    options.width > 0 &&
    options.height > 0
  ) {
    return (options.width * options.height) / 1_000_000;
  }

  return 1;
}

function hasProviderCostUsd(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Bill-time credits for one generation using live admin margin.
 * Returns null when `providerCostUsd` is missing (caller uses legacy columns).
 */
export function billCreditsFromProviderCost(
  model: ModelLivePricingInput,
  options?: ModelLivePricingUnits,
): number | null {
  if (!hasProviderCostUsd(model.providerCostUsd)) {
    return null;
  }
  if (model.pricingType === 'per-token') {
    return null;
  }

  const units = resolveProviderCostUnits(
    model.pricingType,
    model.defaultDuration,
    options,
  );
  return applyMargin(model.providerCostUsd * units);
}

/**
 * Virtual `cost` / `costPerUnit` / `minCost` for API rows and UI.
 *
 * When `providerCostUsd` is set, credits are derived with the process-scoped
 * admin margin so Settings → Models and the next generate stay in sync after
 * a margin change. Stored credit columns are fallback only.
 *
 * Display semantics:
 * - `costPerUnit` → credits for **one** unit (second / megapixel / run)
 * - `cost` → credits for a typical request (defaultDuration seconds, or 1 unit)
 * - `minCost` → same as one unit (floor for short runs)
 */
export function resolveLiveModelCreditPricing(
  model: ModelLivePricingInput,
  options?: ModelLivePricingUnits,
): ModelLiveCreditPricing {
  if (!hasProviderCostUsd(model.providerCostUsd)) {
    return {
      cost: typeof model.cost === 'number' ? model.cost : 0,
      costPerUnit:
        typeof model.costPerUnit === 'number' ? model.costPerUnit : null,
      minCost: typeof model.minCost === 'number' ? model.minCost : null,
    };
  }

  const pricingType = model.pricingType || PricingType.FLAT;
  const unitCredits = applyMargin(model.providerCostUsd);
  const units = resolveProviderCostUnits(
    pricingType,
    model.defaultDuration,
    options,
  );
  const runCredits = applyMargin(model.providerCostUsd * units);

  if (pricingType === PricingType.PER_SECOND) {
    return {
      cost: runCredits,
      costPerUnit: unitCredits,
      minCost: unitCredits,
    };
  }

  if (pricingType === PricingType.PER_MEGAPIXEL) {
    return {
      cost: runCredits,
      costPerUnit: unitCredits,
      minCost: unitCredits,
    };
  }

  // FLAT (and unknown): unit = run
  return {
    cost: unitCredits,
    costPerUnit: null,
    minCost: unitCredits,
  };
}

/** Micro-USD integer scale shared by the vendor-cost ledgers. */
export const VENDOR_COST_MICROS_PER_USD = 1_000_000;

/**
 * Platform vendor cost of one media generation in micro-USD:
 * `providerCostUsd × units`, where units follow the model's pricingType
 * (seconds / megapixels / runs). Returns 0 when the model has no known
 * provider cost — the ledger row then still counts the generation.
 */
export function computeMediaVendorCostMicros(
  model: ModelLivePricingInput,
  options?: ModelLivePricingUnits,
): number {
  if (!hasProviderCostUsd(model.providerCostUsd)) {
    return 0;
  }

  const units = resolveProviderCostUnits(
    model.pricingType,
    model.defaultDuration,
    options,
  );
  return Math.round(model.providerCostUsd * units * VENDOR_COST_MICROS_PER_USD);
}

/**
 * Audit stamp for a charge priced against this model: the margin multiplier in
 * force right now plus the model's provider-cost inputs. Callers attach it to
 * the credit transaction so the charge stays reconstructable after margin or
 * provider-cost changes.
 */
export function buildPricingAuditStamp(
  model: Pick<ModelLivePricingInput, 'pricingType' | 'providerCostUsd'>,
): CreditsPricingMetadata {
  return {
    marginMultiplier: getRuntimeMarginMultiplier(),
    pricingType: model.pricingType ?? null,
    providerCostUsd: hasProviderCostUsd(model.providerCostUsd)
      ? model.providerCostUsd
      : null,
  };
}

/**
 * Project live credit fields onto a model-shaped record without mutating input.
 * Keeps `providerCostUsd` and other fields intact.
 */
export function withLiveModelCreditPricing<T extends ModelLivePricingInput>(
  model: T,
  options?: ModelLivePricingUnits,
): T & ModelLiveCreditPricing {
  return {
    ...model,
    ...resolveLiveModelCreditPricing(model, options),
  };
}
