import { ModelCategory, PricingType } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

/**
 * #4813 Estimate-versus-charge parity matrix. Every case is priced twice in
 * the specs — once through `AgentGenerationEstimateService` with the Agent
 * request inputs, once through the image/video credits service with the
 * generation DTO the Agent tool builds from those same inputs — and both must
 * equal `expectedCredits`, which is derived by hand from the pricing rules.
 * No fixture contacts a provider or debits a balance.
 */
export interface GenerationCreditParityModel {
  readonly cost: number;
  readonly costPerUnit?: number | null;
  readonly key: string;
  readonly minCost?: number | null;
  readonly pricingType?: string | null;
  readonly provider: string;
}

export interface GenerationCreditParityCase {
  readonly aspectRatio: string;
  readonly category: ModelCategory.IMAGE | ModelCategory.VIDEO;
  readonly duration?: number;
  readonly expectedCredits: number;
  readonly model: GenerationCreditParityModel;
  readonly name: string;
  readonly outputs?: number;
  readonly quality?: string;
  readonly resolution?: string;
}

const REPLICATE = 'replicate';
const FAL = 'fal';

export const GENERATION_CREDIT_PARITY_CASES: readonly GenerationCreditParityCase[] =
  [
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      // Replicate without native batch fans out: 4 × 2.
      expectedCredits: 8,
      model: {
        cost: 4,
        key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
        provider: REPLICATE,
      },
      name: 'fixed image cost fans out on a non-batch Replicate model',
      outputs: 2,
    },
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      // Native batch renders every output in one call: 6, not 24.
      expectedCredits: 6,
      model: {
        cost: 6,
        key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
        provider: REPLICATE,
      },
      name: 'fixed image cost is billed once on a native-batch model',
      outputs: 4,
    },
    {
      aspectRatio: '3:4',
      category: ModelCategory.IMAGE,
      // 1024×1365 = 1.39776 MP × 4 → 6 per output, Fal fans out × 3.
      expectedCredits: 18,
      model: {
        cost: 1,
        costPerUnit: 4,
        key: MODEL_KEYS.FAL_FLUX_DEV,
        pricingType: PricingType.PER_MEGAPIXEL,
        provider: FAL,
      },
      name: 'per-megapixel non-square image fans out on Fal',
      outputs: 3,
    },
    {
      aspectRatio: '9:16',
      category: ModelCategory.IMAGE,
      // 576×1024 = 0.589824 MP × 2 → 2, floored to the 5 credit minimum.
      expectedCredits: 5,
      model: {
        cost: 1,
        costPerUnit: 2,
        key: MODEL_KEYS.FAL_FLUX_DEV,
        minCost: 5,
        pricingType: PricingType.PER_MEGAPIXEL,
        provider: FAL,
      },
      name: 'per-megapixel image below the minimum bills the minimum cost',
    },
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      // 50 × 0.112 (low) → 6 per output, Replicate non-batch × 2.
      expectedCredits: 12,
      model: {
        cost: 50,
        key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
        provider: REPLICATE,
      },
      name: 'image quality multiplier applies before fan-out',
      outputs: 2,
      quality: 'low',
    },
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      expectedCredits: 1,
      model: {
        cost: 0,
        key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
        provider: REPLICATE,
      },
      name: 'zero image base cost keeps the one-credit minimum',
    },
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      // Synthetic row: a batch-capable generic key served by Fal. Key-only
      // resolution would bill once as Replicate batch (6); the row's provider
      // is what dispatch executes, so Fal fans out × 4.
      expectedCredits: 24,
      model: {
        cost: 6,
        key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
        provider: FAL,
      },
      name: 'model row provider decides fan-out over the key shape',
      outputs: 4,
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 4,
      // ceil(4 × 10) = 40, floored to the 50 credit minimum.
      expectedCredits: 50,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
      },
      name: 'pilot video duration bills the per-second minimum',
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 8,
      expectedCredits: 80,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
      },
      name: 'full video duration bills per second',
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 5,
      // 50 × (0.224 / 0.168) = 66.67 → 67.
      expectedCredits: 67,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
      },
      name: 'video pro resolution multiplier applies to the floored base',
      resolution: 'pro',
    },
    {
      aspectRatio: '9:16',
      category: ModelCategory.VIDEO,
      duration: 5,
      // 50 × 2.5 (Kling 4K) = 125.
      expectedCredits: 125,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
      },
      name: 'video 4K resolution multiplier applies to the floored base',
      resolution: '4k',
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 8,
      // Flat 30 × 2 (1080p).
      expectedCredits: 60,
      model: {
        cost: 30,
        key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        pricingType: PricingType.FLAT,
        provider: REPLICATE,
      },
      name: 'flat video cost doubles at 1080p',
      resolution: '1080p',
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 8,
      // 1024×576 = 0.589824 MP × 5 → 3 per output, non-batch × 2.
      expectedCredits: 6,
      model: {
        cost: 1,
        costPerUnit: 5,
        key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        pricingType: PricingType.PER_MEGAPIXEL,
        provider: REPLICATE,
      },
      name: 'per-megapixel non-square video multiplies non-batch outputs',
      outputs: 2,
    },
  ];

export const IMAGE_CREDIT_PARITY_CASES = GENERATION_CREDIT_PARITY_CASES.filter(
  (parityCase) => parityCase.category === ModelCategory.IMAGE,
);

export const VIDEO_CREDIT_PARITY_CASES = GENERATION_CREDIT_PARITY_CASES.filter(
  (parityCase) => parityCase.category === ModelCategory.VIDEO,
);
