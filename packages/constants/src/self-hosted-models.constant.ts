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
 * Cost notes (USD list / provider, last review 2026-08):
 * - FLUX Schnell ~$0.003 — cheapest production image model; preferred when
 *   `prioritize=cost` / Lowest Cost.
 * - Nano Banana ~$0.039 — quality-biased platform default for balanced runs.
 *   Do not treat as the "cheap" pick; it is ~13× Schnell.
 * - Seedance 2.5 — **expensive.** BytePlus 5s examples ≈ $0.51 (480p) /
 *   $1.16 (720p) without video input (~$0.10–$0.23 per output second). We
 *   seed **per-second** credits at the 720p-safe unit so longer / higher-res
 *   runs do not undercharge. Prefer short drafts (default 5s).
 *
 * `cost` is **credits** written to `Model.cost` (flat fallback when duration
 * is missing). For PER_SECOND rows, also set costPerUnit + pricingType.
 */
export const SELF_HOSTED_MODELS = [
  {
    category: ModelCategory.IMAGE,
    cost: 0.039,
    costTier: CostTier.MEDIUM,
    description: 'Replicate Nano Banana image generation model',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    label: 'Nano Banana',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.134,
    costTier: CostTier.HIGH,
    description: 'Replicate Nano Banana Pro image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    label: 'Nano Banana Pro',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-pro', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.039,
    costTier: CostTier.MEDIUM,
    description: 'Replicate Nano Banana 2 image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    label: 'Nano Banana 2',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.003,
    costTier: CostTier.LOW,
    description: 'Replicate FLUX Schnell image generation model',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    label: 'FLUX Schnell',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'flux-schnell', owner: 'black-forest-labs' },
  },
  /**
   * Default video model. Credits are intentional and high:
   * - costPerUnit 80 ≈ applyMargin($0.24/s) — covers 720p BytePlus band
   * - cost 400 = 5s × 80 (flat fallback if duration is omitted at bill time)
   * - minCost 200 ≈ floor for a short 480p clip with margin
   * Do not lower these without re-checking Replicate/BytePlus list prices.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 400,
    costPerUnit: 80,
    costTier: CostTier.HIGH,
    description:
      'ByteDance Seedance 2.5 — flagship multimodal video with native audio (up to 30s). Expensive; prefer short drafts.',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    label: 'Seedance 2.5',
    minCost: 200,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'seedance-2.5', owner: 'bytedance' },
  },
  /**
   * Seedream 5 Pro — Replicate list $0.045/img (1K) / $0.09/img (2K).
   * Seed at 2K list price so higher-res runs do not undercharge.
   * Flat USD-style cost matches other curated image rows; discovery can
   * reprice via applyMargin when operators re-sync.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 0.09,
    costTier: CostTier.HIGH,
    description:
      'ByteDance Seedream 5 Pro — flagship image (1K/2K, up to 10 reference images).',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_PRO,
    label: 'Seedream 5 Pro',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'seedream-5-pro', owner: 'bytedance' },
  },
  /**
   * Video upscaler — billed per second of output; cost scales with resolution/
   * fps/pro tier. Unit is intentionally above the VIDEO_UPSCALE category
   * default (40) so 4K/pro paths are not free. Not the category default
   * (Topaz remains the empty-registry fallback).
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
  },
] as const;
