import {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
} from '..';
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
   * GPT Image 1.5 — still selectable via the Legacy pill. Seed at `high`
   * (the model's top OpenAPI quality band) so we never undercharge.
   */
  {
    category: ModelCategory.IMAGE,
    cost: 18,
    costTier: CostTier.HIGH,
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
   * The only curated, active default until Eleven Music, Lyria 3 Pro, and
   * Mureka V9 (below) are verified and switched on by an operator. Curated
   * (cost > 0, isActive/isDefault) so the MUSIC category always has a usable
   * registry row — an uncurated row seeds inactive and free, which left the
   * router with nothing to select (#4679).
   *
   * `endpoint` MUST carry the pinned version hash. `meta/musicgen` alone
   * resolves to `resolvePredictionTarget`'s `{ model }` form
   * (replicate.service.ts), which Replicate's predictions API only serves
   * for its own verified "official model" catalog — not every public
   * owner/name slug. Dropping the hash 404s every generation. Pin here
   * (not the pinned-constant-in-application-code pattern this replaced —
   * see #4679) so an operator can re-pin to a newer version by editing the
   * registry row, without a code change.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 17,
    costTier: CostTier.LOW,
    description:
      'Meta MusicGen — text-to-music generation, 5-30 second instrumental clips.',
    endpoint:
      'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
    isDefault: true,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_META_MUSICGEN,
    label: 'MusicGen',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'musicgen', owner: 'meta' },
    providerCostUsd: 0.05,
  },
  /**
   * fal.ai — https://fal.ai/learn/devs/elevenlabs-music-user-guide ,
   * https://fal.ai/learn/tools/best-text-to-music-apis-2026 ($0.80/output
   * minute). Seeded inactive: an operator verifies pricing/quality against a
   * live fal account before flipping `isActive` (Settings → Models). Runs
   * through the existing fal integration (`FalService`), not a new provider.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 120,
    costPerUnit: 4,
    costTier: CostTier.MEDIUM,
    description:
      'ElevenLabs Music via fal — full compositions with vocals and lyrics, 10s-90s.',
    endpoint: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    isActive: false,
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    label: 'Eleven Music',
    minCost: 40,
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.FAL,
    providerCostUsd: 0.0133,
  },
  /**
   * fal.ai — https://fal.ai/learn/tools/best-text-to-music-apis-2026
   * ($0.08/song via fal; Google's own Gemini API lists the same $0.08/song
   * for Lyria 3 Pro). Seeded inactive pending operator verification.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 27,
    costTier: CostTier.LOW,
    description:
      'Google Lyria 3 Pro via fal — full songs with vocals, lyrics, and multi-language support, up to 90s.',
    endpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
    isActive: false,
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.FAL_LYRIA3_PRO,
    label: 'Lyria 3 Pro',
    provider: ModelProvider.FAL,
    providerCostUsd: 0.08,
  },
  /**
   * Mureka platform API — https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
   * (official direct API, ~$0.045/song per published prepaid-credit tiers).
   * Direct integration (`MurekaService`, not fal/Replicate) configured via
   * `MUREKA_API_KEY` / `MUREKA_API_BASE_URL` / `MUREKA_MODEL`. Seeded
   * inactive: the field-level contract (request/response shape) should be
   * confirmed against a live Mureka account before activation.
   */
  {
    category: ModelCategory.MUSIC,
    cost: 15,
    costTier: CostTier.LOW,
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
