import { ModelCategory, PricingType } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ReviewedProviderPricing } from '@genfeedai/contracts/interfaces';

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
  readonly isFree?: boolean;
  readonly reviewedPricing?: ReviewedProviderPricing;
  readonly rateVersion?: string;
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

function reviewedRate(
  unit: 'second' | 'output',
  price: number,
  when: Record<string, string>,
): ReviewedProviderPricing {
  return {
    version: 'parity-fixture-v1',
    currency: 'USD',
    sourceUrl: 'https://example.test/fictional-test-tariff',
    verifiedAt: '2026-09-30T00:00:00.000Z',
    reviewStatus: 'approved',
    rates: [
      {
        component: 'generation',
        unit,
        unitPriceUsd: price,
        when,
        isPerOutput: unit === 'second',
      },
    ],
  };
}

const REPLICATE = 'replicate';
const FAL = 'fal';

// Published FLUX.3 prices, rounded at the parity suite's margin of one.
const FLUX_3_PARITY_CASES: readonly GenerationCreditParityCase[] = [
  { resolution: '768sq', price: 0.0205, expectedCredits: 3 },
  { resolution: '1k', price: 0.024, expectedCredits: 3 },
  { resolution: '1.5k', price: 0.035, expectedCredits: 4 },
  { resolution: '2k', price: 0.05, expectedCredits: 5 },
  { resolution: '4k', price: 0.3035, expectedCredits: 31 },
].map<GenerationCreditParityCase>(({ resolution, price, expectedCredits }) => ({
  aspectRatio: 'auto',
  category: ModelCategory.IMAGE,
  expectedCredits,
  model: {
    cost: 8,
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    provider: REPLICATE,
    reviewedPricing: reviewedRate('output', price, { resolution }),
    rateVersion: 'parity-fixture-v1',
  },
  name: `FLUX.3 ${resolution} quote and charge select the native resolution tariff`,
  outputs: 1,
  resolution,
}));

export const GENERATION_CREDIT_PARITY_CASES: readonly GenerationCreditParityCase[] =
  [
    ...FLUX_3_PARITY_CASES,
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
      // One request renders four billable outputs under this configured output tariff.
      expectedCredits: 24,
      model: {
        cost: 6,
        key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
        provider: REPLICATE,
      },
      name: 'native batch bills the four outputs under its frozen output tariff',
      outputs: 4,
    },
    {
      aspectRatio: '3:4',
      category: ModelCategory.IMAGE,
      // 1024×1365 × 0.000001 × 4 × 3 = 16.77312, rounded once to 17.
      expectedCredits: 17,
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
      // ceil($0.018 × 2 outputs / $0.01 per credit) = 4.
      expectedCredits: 4,
      model: {
        cost: 50,
        key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
        provider: REPLICATE,
        reviewedPricing: reviewedRate('output', 0.018, { quality: 'low' }),
        rateVersion: 'parity-fixture-v1',
      },
      name: 'reviewed output tariff selects low quality before aggregate rounding',
      outputs: 2,
      quality: 'low',
    },
    {
      aspectRatio: '1:1',
      category: ModelCategory.IMAGE,
      expectedCredits: 0,
      model: {
        cost: 0,
        isFree: true,
        key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
        provider: REPLICATE,
      },
      name: 'explicitly free image tariff requires zero platform credits',
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
      // $0.04 × 5 seconds / $0.01 per credit = 20.
      expectedCredits: 20,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
        reviewedPricing: reviewedRate('second', 0.04, { resolution: 'pro' }),
        rateVersion: 'parity-fixture-v1',
      },
      name: 'reviewed video pro tariff prices actual seconds',
      resolution: 'pro',
    },
    {
      aspectRatio: '9:16',
      category: ModelCategory.VIDEO,
      duration: 5,
      // ceil($0.075 × 5 seconds / $0.01 per credit) = 38.
      expectedCredits: 38,
      model: {
        cost: 40,
        costPerUnit: 10,
        key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        minCost: 50,
        pricingType: PricingType.PER_SECOND,
        provider: REPLICATE,
        reviewedPricing: reviewedRate('second', 0.075, { resolution: '4k' }),
        rateVersion: 'parity-fixture-v1',
      },
      name: 'reviewed video 4K tariff prices actual seconds',
      resolution: '4k',
    },
    {
      aspectRatio: '16:9',
      category: ModelCategory.VIDEO,
      duration: 8,
      // $0.18 per output / $0.01 per credit = 18.
      expectedCredits: 18,
      model: {
        cost: 30,
        key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        pricingType: PricingType.FLAT,
        provider: REPLICATE,
        reviewedPricing: reviewedRate('output', 0.18, { resolution: '1080p' }),
        rateVersion: 'parity-fixture-v1',
      },
      name: 'reviewed output tariff prices the 1080p variant',
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
