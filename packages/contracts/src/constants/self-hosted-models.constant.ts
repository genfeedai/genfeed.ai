import {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '..';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * Curated media defaults for the model registry seed.
 *
 * **Bill-time path (preferred):** store raw provider USD in `providerCostUsd`.
 * Credits guard multiplies by units and runs `applyMargin`, which reads the
 * live admin `PlatformSetting.marginMultiplierGeneration`. Change margin →
 * next generate re-prices without rewriting model rows.
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
  ...[ModelCategory.IMAGE, ModelCategory.IMAGE_EDIT].map((category) => ({
    category,
    cost: 8,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'FLUX.3 Image — generation and reference editing with up to ten images, five resolutions and one output.',
    isDefault: false,
    isHighlighted: true,
    key:
      category === ModelCategory.IMAGE
        ? MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE
        : MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    // Own key as endpoint: `models_provider_endpoint_key` forbids two rows on
    // one (provider, endpoint). Dispatch maps the edit row back to the hosted
    // model with `resolveFlux3ReplicateEndpoint`.
    endpoint:
      category === ModelCategory.IMAGE
        ? MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE
        : MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    label: category === ModelCategory.IMAGE ? 'FLUX.3' : 'FLUX.3 Edit',
    pricingType: PricingType.FLAT,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'flux-3-image', owner: 'black-forest-labs' },
    providerCostUsd: 0.024,
  })),
  {
    category: ModelCategory.IMAGE_EDIT,
    cost: 20,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.MEDIUM,
    description:
      'Ideogram 4.5 — instruction-based image editing with up to five source images and an optional mask. Medium quality preserves source proportions by default.',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
    label: 'Ideogram 4.5',
    pricingType: PricingType.FLAT,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'ideogram-4-5', owner: 'ideogram-ai' },
    providerCostUsd: 0.06,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 12,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.STANDARD,
    speedTier: SpeedTier.MEDIUM,
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
    qualityTier: QualityTier.STANDARD,
    speedTier: SpeedTier.MEDIUM,
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
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.MEDIUM,
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
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
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
    cost: 12,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.FAST,
    description:
      'Google Nano Banana 2.1 — image generation and editing at 1K, 2K, and 4K with up to 14 references. The seeded USD is the 1K output price; 2K and 4K bill from the reviewed rate sheet.',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_1,
    label: 'Nano Banana 2.1',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2.1', owner: 'google' },
    providerCostUsd: 0.0336,
  },
  {
    category: ModelCategory.IMAGE,
    cost: 2,
    costTier: CostTier.LOW,
    qualityTier: QualityTier.BASIC,
    speedTier: SpeedTier.FAST,
    description:
      'FLUX.1 Schnell — legacy speed-focused image model for development and compatibility. Production Auto uses current recommended models.',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    label: 'FLUX.1 Schnell',
    lifecycle: ModelLifecycle.LEGACY,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'flux-schnell', owner: 'black-forest-labs' },
    providerCostUsd: 0.003,
  },
  /**
   * Cloud default. H3 costs $0.08/s at 768P and $0.13/s at 2K. Seed the
   * conservative 2K rate; the shared resolution quote/reservation discounts
   * the published 768P draft band when selected.
   * 5s → $0.65 provider cost; live credits come from applyMargin.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 217,
    costPerUnit: 44,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
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
   * fal list price after the October 15, 2026 promotion: $0.05/s at 480P,
   * $0.08/s at 768P, $0.16/s at 1080P. Text and image endpoints match.
   * Seed the default 768P band; the resolution quote discounts 480P and
   * doubles 1080P.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 134,
    costPerUnit: 27,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'MiniMax H3 Max via fal — 5–15 second video with native synchronized audio, 480P/768P/1080P output, and optional first/last frames.',
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
   * Realtime Director route. Fal list price after the October 15, 2026
   * promotion is $0.08/s, and 1080P is 2×. Every session bills at least
   * 60 seconds ($4.80 at 480P/768P, $9.60 at 1080P). `cost` and `minCost`
   * are that 60-second standard-rate floor. The reserved quantity is the
   * user-declared ceiling, not a plan tier.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 1599,
    costPerUnit: 27,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'MiniMax H3 Max Director — realtime steered video billed per elapsed second, including idle time, with a 60-second session minimum.',
    endpoint: 'minimax/h3-max/director',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
    label: 'H3 Max Director',
    minCost: 1599,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.FAL,
    providerConfig: { name: 'h3-max/director', owner: 'minimax' },
    providerCostUsd: 0.08,
  },
  /**
   * Premium long-form video. providerCostUsd is **per second**
   * (720p-safe ~$0.24/s). 5s → $1.20 provider cost; live credits from applyMargin.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 400,
    costPerUnit: 80,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.SLOW,
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
   * fal bills tokens. The published 720p equivalent is about $0.125/s for
   * text and $0.13/s when reference video is included. One row covers both
   * routes, so seed the higher published equivalent.
   * 8s → $1.04 provider cost; live credits come from applyMargin.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 347,
    costPerUnit: 44,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.FAST,
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
   * 1080p draft-off is $0.04/s. Draft mode is not dispatched.
   * 5s → $0.10 provider cost; live credits come from applyMargin.
   * Cloud keeps MiniMax H3 as `isDefault`; local/e2e promote this row.
   */
  {
    category: ModelCategory.VIDEO,
    cost: 35,
    costPerUnit: 7,
    costTier: CostTier.LOW,
    qualityTier: QualityTier.BASIC,
    speedTier: SpeedTier.FAST,
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
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
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
   * GPT Image 1.5 — still selectable via the Legacy pill. Seed at `high`
   * (the model's top OpenAPI quality band) so we never undercharge.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 18,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'OpenAI GPT Image 1.5 — previous GPT Image generation and editing model.',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    label: 'GPT Image 1.5',
    lifecycle: ModelLifecycle.LEGACY,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'gpt-image-1.5', owner: 'openai' },
    providerCostUsd: 0.053,
    succeededBy: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_FLARE,
  },
  /**
   * GPT Image 2 — still in the main picker. Seed at `high`, its top quality band.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 18,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'OpenAI GPT Image 2 — instruction-following image generation and editing.',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
    label: 'GPT Image 2',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'gpt-image-2', owner: 'openai' },
    providerCostUsd: 0.053,
  },
  /**
   * GPT Image 2.5 Flare — seed at OpenAPI `max` 1024×1024 (~$0.211)
   * so a missing or `auto` quality never undercharges.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 70,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'OpenAI GPT Image 2.5 Flare — fastest 2.5 image model, high-quality everyday generation and editing.',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_FLARE,
    label: 'GPT Image 2.5 Flare',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'gpt-image-2.5-flare', owner: 'openai' },
    providerCostUsd: 0.211,
  },
  /**
   * GPT Image 2.5 Sunburst — same token list as Flare. Seed at `max`.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 70,
    costTier: CostTier.HIGH,
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.SLOW,
    description:
      'OpenAI GPT Image 2.5 Sunburst — most capable 2.5 image model for precise edits and detailed control.',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_SUNBURST,
    label: 'GPT Image 2.5 Sunburst',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'gpt-image-2.5-sunburst', owner: 'openai' },
    providerCostUsd: 0.211,
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
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
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
  /**
   * Legacy. MusicGen's weights are CC-BY-NC 4.0 (facebookresearch/audiocraft,
   * Hugging Face `facebook/musicgen-large`), so output cannot be sold, and it
   * ranks last (19 of 19) on the Artificial Analysis instrumental board.
   * Kept so existing records and the Replicate prompt builder still resolve;
   * Lyria 3 Pro is the active music default.
   *
   * `endpoint` MUST carry the pinned version hash. `meta/musicgen` alone
   * resolves to `resolvePredictionTarget`'s `{ model }` form
   * (replicate.service.ts), which Replicate's predictions API only serves
   * for its own verified "official model" catalog — not every public
   * owner/name slug. Dropping the hash 404s every generation.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 17,
    costTier: CostTier.LOW,
    qualityTier: QualityTier.BASIC,
    speedTier: SpeedTier.FAST,
    description:
      'Meta MusicGen — legacy, non-commercial weights (CC-BY-NC 4.0). Replaced by Lyria 3 Pro.',
    endpoint:
      'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
    isActive: false,
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_META_MUSICGEN,
    label: 'MusicGen',
    lifecycle: ModelLifecycle.LEGACY,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'musicgen', owner: 'meta' },
    providerCostUsd: 0.05,
    succeededBy: MODEL_KEYS.FAL_LYRIA3_PRO,
  },
  /**
   * fal.ai — https://fal.ai/models/fal-ai/elevenlabs/music ($0.60 per output
   * minute, rounded up to the next minute). Seeded inactive until an operator
   * turns it on. Runs through the existing fal integration (`FalService`).
   *
   * LEGAL HOLD: the ElevenLabs Music Terms (updated 2026-10-09) mark every
   * self-serve tier "Model Resale Prohibited" and clause 4.3 bars "offering
   * any Music Model alongside third-party models", which the router does.
   * Keep it off and out of the quality picks until that is cleared.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 200,
    costPerUnit: 4,
    costTier: CostTier.MEDIUM,
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.SLOW,
    description:
      'ElevenLabs Music via fal — full compositions with vocals and lyrics, 10s-90s.',
    endpoint: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    isActive: false,
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    label: 'Eleven Music',
    minCost: 200,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.FAL,
    providerConfig: { name: 'music', owner: 'elevenlabs' },
    providerCostUsd: 0.01,
  },
  /**
   * fal.ai — https://fal.ai/models/fal-ai/lyria3/pro ($0.08 per audio,
   * verified on the fal page 2026-10-10). Active music default: rank 5 on the
   * Artificial Analysis instrumental board (Elo 1078). Every track carries a
   * SynthID watermark; Google's API terms say it will not claim ownership of
   * the output. No Lyria-specific commercial-use section was found, so
   * confirm the terms before selling.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 27,
    costTier: CostTier.LOW,
    qualityTier: QualityTier.ULTRA,
    speedTier: SpeedTier.MEDIUM,
    description:
      'Google Lyria 3 Pro via fal — full songs with vocals, lyrics, and multi-language support, up to 90s.',
    endpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
    isActive: true,
    isDefault: true,
    isHighlighted: false,
    key: MODEL_KEYS.FAL_LYRIA3_PRO,
    label: 'Lyria 3 Pro',
    provider: ModelProvider.FAL,
    providerConfig: { name: 'pro', owner: 'lyria3' },
    providerCostUsd: 0.08,
  },
  /**
   * Mureka platform API — https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
   * (official direct API, ~$0.045/song per published prepaid-credit tiers).
   * Direct integration (`MurekaService`, not fal/Replicate) configured via
   * `MUREKA_API_KEY` / `MUREKA_API_BASE_URL` / `MUREKA_MODEL`. Seeded
   * inactive until an operator verifies one paid generation per endpoint.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 15,
    costTier: CostTier.LOW,
    qualityTier: QualityTier.HIGH,
    speedTier: SpeedTier.MEDIUM,
    description:
      'Mureka V9 — lyrics-first song generation via a direct API integration, up to 90s.',
    isActive: false,
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.MUREKA_V9,
    label: 'Mureka V9',
    provider: ModelProvider.MUREKA,
    providerConfig: { name: 'v9', owner: 'mureka' },
    providerCostUsd: 0.045,
  },
] as const;
