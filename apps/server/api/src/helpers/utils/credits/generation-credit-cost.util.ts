import { type ByokProvider, PricingType } from '@genfeedai/contracts';
import type { CreditsPricingMetadata } from '@genfeedai/contracts/interfaces';
import { getVideoGenerationResolutionCreditMultiplier } from '@genfeedai/pricing';

export const FALLBACK_GENERATION_CREDIT_COST = 5;
export const DEFAULT_GENERATION_WIDTH = 1920;
export const DEFAULT_GENERATION_HEIGHT = 1080;

export type GenerationCreditModelPricing = {
  cost?: number | null;
  costPerUnit?: number | null;
  minCost?: number | null;
  pricingType?: string | null;
};

export type DeferredCreditsConfig = {
  amount?: number;
  deferred?: boolean;
  isByokBypass?: boolean;
  modelKey?: string;
  pricingMetadata?: CreditsPricingMetadata;
  provider?: ByokProvider;
};

export type DeferredCreditsRequest = {
  creditsConfig?: DeferredCreditsConfig;
};

export function isDeferredCreditsRequest(
  request: DeferredCreditsRequest,
): boolean {
  return Boolean(request.creditsConfig?.deferred);
}

export function commitDeferredCredits(
  request: DeferredCreditsRequest,
  amount: number,
  modelKey: string,
  pricingMetadata?: CreditsPricingMetadata,
): void {
  request.creditsConfig = {
    ...request.creditsConfig,
    amount,
    deferred: false,
    modelKey,
    ...(pricingMetadata ? { pricingMetadata } : {}),
  };
}

export function resolveGenerationDimensions(
  width?: number,
  height?: number,
): { height: number; width: number } {
  return {
    height: height || DEFAULT_GENERATION_HEIGHT,
    width: width || DEFAULT_GENERATION_WIDTH,
  };
}

export function requestedOutputCount(outputs: unknown): number {
  return Number(outputs) || 1;
}

export function videoOutputCount(outputs?: number): number {
  return outputs || 1;
}

export function applyVideoResolutionCreditMultiplier(
  cost: number,
  modelKey: string,
  resolution?: string,
): number {
  return Math.ceil(
    cost * getVideoGenerationResolutionCreditMultiplier(modelKey, resolution),
  );
}

export function doesImageProviderFanOutPerOutput(
  provider: string | undefined,
  isBatchSupported: boolean,
): boolean {
  if (provider === 'fal') {
    return true;
  }

  return provider === 'replicate' && !isBatchSupported;
}

export function scaleCreditsForFanOut(
  baseCost: number,
  outputs: number,
  shouldFanOut: boolean,
): number {
  if (shouldFanOut && outputs > 1) {
    return baseCost * outputs;
  }

  return baseCost;
}

export function scaleCreditsForNonBatchOutputs(
  baseCost: number,
  outputs: number,
  isBatchSupported: boolean,
): number {
  if (!isBatchSupported && outputs > 1) {
    return baseCost * outputs;
  }

  return baseCost;
}

export function resolveModelCreditCost(
  model: GenerationCreditModelPricing | null | undefined,
  compute: (model: GenerationCreditModelPricing) => number,
): number {
  return model ? compute(model) : FALLBACK_GENERATION_CREDIT_COST;
}

export function calculateMegapixelCost(
  width: number,
  height: number,
  costPerUnit: number,
): number {
  return Math.ceil(((width * height) / 1_000_000) * costPerUnit);
}

export function calculatePerSecondCost(
  duration: number,
  costPerUnit: number,
): number {
  return Math.ceil(duration * costPerUnit);
}

export function applyMinCost(baseCost: number, minCost: number): number {
  return minCost > 0 && baseCost < minCost ? minCost : baseCost;
}

function isPerMegapixelRate(
  pricingType: string,
  width: number,
  height: number,
  costPerUnit?: number | null,
): boolean {
  return (
    pricingType === PricingType.PER_MEGAPIXEL &&
    Boolean(width && height && costPerUnit)
  );
}

function isPerSecondRate(
  pricingType: string,
  duration: number,
  costPerUnit?: number | null,
): boolean {
  return (
    pricingType === PricingType.PER_SECOND && Boolean(duration && costPerUnit)
  );
}

export function calculateDynamicImageCost(
  model: GenerationCreditModelPricing,
  width: number,
  height: number,
): number {
  const pricingType = model.pricingType || PricingType.FLAT;
  const baseCost = isPerMegapixelRate(
    pricingType,
    width,
    height,
    model.costPerUnit,
  )
    ? calculateMegapixelCost(width, height, model.costPerUnit as number)
    : model.cost || 0;

  return applyMinCost(baseCost, model.minCost || 0);
}

export function calculateDynamicVideoCost(
  model: GenerationCreditModelPricing,
  width: number,
  height: number,
  duration: number,
): number {
  const pricingType = model.pricingType || PricingType.FLAT;
  const megapixelCost = isPerMegapixelRate(
    pricingType,
    width,
    height,
    model.costPerUnit,
  )
    ? calculateMegapixelCost(width, height, model.costPerUnit as number)
    : undefined;
  const perSecondCost =
    megapixelCost === undefined &&
    isPerSecondRate(pricingType, duration, model.costPerUnit)
      ? calculatePerSecondCost(duration, model.costPerUnit as number)
      : undefined;
  const baseCost = (megapixelCost ?? perSecondCost ?? model.cost) || 0;

  return applyMinCost(baseCost, model.minCost || 0);
}
