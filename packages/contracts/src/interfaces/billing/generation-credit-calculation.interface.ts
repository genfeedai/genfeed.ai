/**
 * #4813 Shared generation pricing contract. Quoting (Agent review card
 * estimates) and charging (image/video generation credits) both feed these
 * inputs into the same `@genfeedai/pricing` calculator so a displayed quote
 * can never drift from the downstream debit.
 */

/** Pricing snapshot of the model row the request is priced against. */
export interface GenerationCreditPricingSnapshot {
  cost?: number | null;
  costPerUnit?: number | null;
  minCost?: number | null;
  pricingType?: string | null;
}

/** Effective execution dimensions in pixels. */
export interface GenerationExecutionDimensions {
  height: number;
  width: number;
}

export interface GenerationCreditCalculationBaseInput {
  height?: number;
  /** Provider capability: native batch renders every output in one call. */
  isBatchSupported: boolean;
  modelKey: string;
  /** Requested output count; missing or zero bills as a single output. */
  outputs?: number;
  /** `null` when the catalog has no row — charging falls back to a flat rate. */
  pricing: GenerationCreditPricingSnapshot | null;
  width?: number;
}

export interface ImageGenerationCreditCalculationInput
  extends GenerationCreditCalculationBaseInput {
  /** Dispatch provider (`fal`, `replicate`, ...) that decides output fan-out. */
  imageProvider?: string | null;
  quality?: string;
}

export interface VideoGenerationCreditCalculationInput
  extends GenerationCreditCalculationBaseInput {
  duration?: number;
  resolution?: string;
}

export interface GenerationCreditCalculation {
  /** Required credits for the whole request. */
  credits: number;
  dimensions: GenerationExecutionDimensions;
  /** Output count the request is billed for (1 when the provider batches). */
  billedOutputs: number;
  /** Credits for a single output after dimension, minimum and multipliers. */
  unitCredits: number;
}
