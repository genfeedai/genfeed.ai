import { PricingType } from '@genfeedai/contracts';
import type {
  GenerationCreditCalculation,
  GenerationCreditPricingSnapshot,
  GenerationExecutionDimensions,
  ImageGenerationCreditCalculationInput,
  VideoGenerationCreditCalculationInput,
} from '@genfeedai/contracts/interfaces';

import {
  getVideoGenerationResolutionCreditMultiplier,
  quoteImageGenerationQualityCredits,
} from './provider-pricing';

/**
 * #4813 One pricing contract for quoting and charging.
 *
 * `ImageGenerationCreditsService` / `VideoGenerationCreditsService` reserve
 * the amount these calculators return, and `AgentGenerationEstimateService`
 * quotes the same functions with the same normalized inputs. Any pricing rule
 * (dimensions, minimum cost, multipliers, fan-out or batch output semantics)
 * lives here and nowhere else.
 */

/** Charged when the catalog has no row for the requested model. */
export const FALLBACK_GENERATION_CREDIT_COST = 5;
export const DEFAULT_GENERATION_WIDTH = 1920;
export const DEFAULT_GENERATION_HEIGHT = 1080;

export function resolveGenerationDimensions(
  width?: number,
  height?: number,
): GenerationExecutionDimensions {
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

/** Fal renders one call per output; Replicate only when the model cannot batch. */
export function doesImageProviderFanOutPerOutput(
  provider: string | null | undefined,
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
  model: GenerationCreditPricingSnapshot | null | undefined,
  compute: (model: GenerationCreditPricingSnapshot) => number,
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
  model: GenerationCreditPricingSnapshot,
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
  model: GenerationCreditPricingSnapshot,
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

/**
 * Image request → required credits. Effective dimensions drive per-megapixel
 * pricing, the model minimum floors the base, the quality band scales it (one
 * credit minimum), and outputs multiply only when the provider fans out.
 */
export function calculateImageGenerationCredits(
  input: ImageGenerationCreditCalculationInput,
): GenerationCreditCalculation {
  const dimensions = resolveGenerationDimensions(input.width, input.height);
  const baseCost = resolveModelCreditCost(input.pricing, (model) =>
    calculateDynamicImageCost(model, dimensions.width, dimensions.height),
  );
  const unitCredits = quoteImageGenerationQualityCredits(
    baseCost,
    input.modelKey,
    input.quality,
  );
  const outputs = requestedOutputCount(input.outputs);
  const shouldFanOut = doesImageProviderFanOutPerOutput(
    input.imageProvider,
    input.isBatchSupported,
  );
  const credits = scaleCreditsForFanOut(unitCredits, outputs, shouldFanOut);

  return {
    billedOutputs: credits / unitCredits,
    credits,
    dimensions,
    unitCredits,
  };
}

/**
 * Video request → required credits. Per-megapixel beats per-second beats flat,
 * the model minimum floors the base, the resolution band scales it, and
 * outputs multiply only when the model cannot batch natively.
 */
export function calculateVideoGenerationCredits(
  input: VideoGenerationCreditCalculationInput,
): GenerationCreditCalculation {
  const dimensions = resolveGenerationDimensions(input.width, input.height);
  const baseCost = resolveModelCreditCost(input.pricing, (model) =>
    calculateDynamicVideoCost(
      model,
      dimensions.width,
      dimensions.height,
      input.duration || 0,
    ),
  );
  const unitCredits = applyVideoResolutionCreditMultiplier(
    baseCost,
    input.modelKey,
    input.resolution,
  );
  const outputs = videoOutputCount(input.outputs);
  const credits = scaleCreditsForNonBatchOutputs(
    unitCredits,
    outputs,
    input.isBatchSupported,
  );

  return {
    billedOutputs: unitCredits > 0 ? credits / unitCredits : 1,
    credits,
    dimensions,
    unitCredits,
  };
}
