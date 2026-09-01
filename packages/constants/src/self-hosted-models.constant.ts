import {
  CostTier,
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/enums';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * Curated media defaults for the model registry seed.
 *
 * **Bill-time path (preferred):** store raw provider USD in `providerCostUsd`.
 * Credits guard multiplies by units and runs `applyMargin`, which reads the
 * live admin `PlatformSetting.marginMultiplier`. Change margin → next generate
 * re-prices without rewriting model rows.
 *
 * **providerCostUsd unit** follows `pricingType`:
 * - FLAT → USD per run/image
 * - PER_SECOND → USD per output second
 *
 * `cost` / `costPerUnit` remain as display/legacy fallbacks (pre-baked credits
 * at margin 1.0). Prefer updating `providerCostUsd` when list prices change.
 *
 * List prices last reviewed 2026-08.
 */
export const SELF_HOSTED_MODELS = [
  {
    category: ModelCategory.IMAGE,
    cost: 12,
    costTier: CostTier.MEDIUM,
    description:
      'Google Nano Banana 2 Lite — fast 1K image generation and editing with up to 14 references.',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE,
    label: 'Nano Banana 2 Lite',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2-lite', owner: 'google' },
    providerCostUsd: 0.034,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 13,
    costTier: CostTier.MEDIUM,
    description: 'Replicate Nano Banana image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    label: 'Nano Banana',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana', owner: 'google' },
    providerCostUsd: 0.039,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 45,
    costTier: CostTier.HIGH,
    description: 'Replicate Nano Banana Pro image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    label: 'Nano Banana Pro',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-pro', owner: 'google' },
    providerCostUsd: 0.134,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 13,
    costTier: CostTier.MEDIUM,
    description: 'Replicate Nano Banana 2 image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    label: 'Nano Banana 2',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2', owner: 'google' },
    providerCostUsd: 0.039,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 2,
    costTier: CostTier.LOW,
    description: 'Replicate FLUX Schnell image generation model',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    label: 'FLUX Schnell',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'flux-schnell', owner: 'black-forest-labs' },
    providerCostUsd: 0.003,
  },
  /**
   * Cloud default. H3 costs $0.08/s at 768P and $0.13/s at 2K. Seed the
   * conservative 2K rate; the shared resolution quote/reservation discounts
   * the published 768P draft band when selected.
   * 5s → applyMargin(0.65) ≈ 217 credits at margin 1.0.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 217,
    costPerUnit: 44,
    costTier: CostTier.HIGH,
    description:
      'MiniMax H3 — multimodal text, first/last-frame, and reference video generation with native audio at 768P or 2K.',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_MINIMAX_H3,
    label: 'MiniMax H3',
    minCost: 174,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'h3', owner: 'minimax' },
    providerCostUsd: 0.13,
  },
  /**
   * fal publishes separate text-to-video and image-to-video endpoints. The
   * registry tracks the text contract; dispatch switches to image-to-video
   * when a first frame is present.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 134,
    costPerUnit: 27,
    costTier: CostTier.HIGH,
    description:
      'MiniMax H3 Max via fal — 5–15 second video with native synchronized audio, 480P/768P output, and optional first/last frames.',
    endpoint: 'minimax/h3-max/text-to-video',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.FAL_MINIMAX_H3_MAX,
    label: 'MiniMax H3 Max',
    minCost: 84,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.FAL,
    providerConfig: { name: 'h3-max/text-to-video', owner: 'minimax' },
    providerCostUsd: 0.08,
  },
  /**
   * Premium long-form video. providerCostUsd is **per second**
   * (720p-safe ~$0.24/s). 5s → applyMargin(1.20) ≈ 400 credits.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 400,
    costPerUnit: 80,
    costTier: CostTier.HIGH,
    description:
      'ByteDance Seedance 2.5 — flagship multimodal video with native audio (up to 30s). Expensive; prefer short drafts.',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    label: 'Seedance 2.5',
    minCost: 200,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'seedance-2.5', owner: 'bytedance' },
    providerCostUsd: 0.24,
  },
  /**
   * fal partner endpoint. The public contract bills reference/input video at
   * $0.13/s; seed that conservative band for text and image-reference modes.
   * 8s -> applyMargin(1.04) ~= 347 credits at margin 1.0.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 347,
    costPerUnit: 44,
    costTier: CostTier.HIGH,
    description:
      'Google Gemini Omni Flash via fal — synchronized-audio video from text, a first image, or up to three reference images.',
    endpoint: 'google/gemini-omni-flash',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
    label: 'Gemini Omni Flash',
    minCost: 132,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.FAL,
    providerConfig: { name: 'gemini-omni-flash', owner: 'google' },
    providerCostUsd: 0.13,
  },
  /**
   * Cheapest T2V already wired in the Replicate video builder.
   * providerCostUsd is **per second** at 720p draft-off ($0.02/s).
   * 5s → applyMargin(0.10) ≈ 35 credits at margin 1.0.
   * Cloud keeps MiniMax H3 as `isDefault`; local/e2e promote this row.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 35,
    costPerUnit: 7,
    costTier: CostTier.LOW,
    description:
      'PrunaAI P-Video — cheapest text-to-video (T2V/I2V, draft mode). Use for local and e2e.',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    label: 'P-Video',
    minCost: 10,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'p-video', owner: 'prunaai' },
    providerCostUsd: 0.02,
  },
  /**
   * Seedream 5 Pro — Replicate list $0.045/img (1K) / $0.09/img (2K).
   * Seed at 2K list so higher-res runs do not undercharge.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 30,
    costTier: CostTier.HIGH,
    description:
      'ByteDance Seedream 5 Pro — flagship image (1K/2K, up to 10 reference images).',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_PRO,
    label: 'Seedream 5 Pro',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'seedream-5-pro', owner: 'bytedance' },
    providerCostUsd: 0.09,
  },
  /**
   * Video upscaler — USD per output second (conservative mid band).
   * Not the category default (Topaz remains empty-registry fallback).
   */
  {
    category: ModelCategory.VIDEO_UPSCALE,
    cost: 250,
    costPerUnit: 50,
    costTier: CostTier.HIGH,
    description:
      'ByteDance vCube video upscaler — up to 4K/60fps with scene presets (aigc/ugc/film).',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
    label: 'ByteDance Video Upscaler',
    minCost: 100,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'video-upscaler', owner: 'bytedance' },
    providerCostUsd: 0.05,
  },
] as const;
