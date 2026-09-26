import { MODEL_KEYS } from '@genfeedai/contracts/constants';

/**
 * #3470 deterministic corpus. The spec locks brief → dispatch contracts for
 * every scenario; the content-eval media ladder (#4926) replays the same
 * objectives as internal tasks, so the list lives here rather than in the spec.
 */

export const GENERATION_BRIEF_IMAGE_EVAL_SCENARIOS = [
  {
    fidelityMode: 'off' as const,
    id: 'image-unbranded-t2i',
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    objective: 'a sunset over the ocean',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-guided-product',
    model: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
    objective: 'Create a launch still of the bottle on marble',
    references: [{ assetId: 'product-1', role: 'product' as const }],
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-guided-negative',
    model: MODEL_KEYS.SDXL,
    objective: 'editorial bottle portrait',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-fal-schnell',
    model: MODEL_KEYS.FAL_FLUX_SCHNELL,
    objective: 'a ceramic cup on linen',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-recraft',
    model: MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4,
    objective: 'flat vector icon of a fox',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-grok-imagine',
    model: MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_IMAGE,
    objective: 'cinematic night market',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-leonardo',
    model: MODEL_KEYS.LEONARDOAI,
    objective: 'fashion lookbook still',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-higgsfield-soul',
    model: MODEL_KEYS.HIGGSFIELD_SOUL,
    objective: 'vertical portrait of a founder',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-self-hosted-flux2',
    model: MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
    objective: 'product hero on black',
  },
  {
    fidelityMode: 'strict' as const,
    id: 'image-pulid-identity',
    model: MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
    objective: 'a portrait of the brand face',
    references: [{ assetId: 'face-1', role: 'character' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-z-turbo',
    model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
    objective: 'soft daylight interior',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-text-in-frame',
    model: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    objective: 'poster that reads GENFEED',
  },
] as const;

export const GENERATION_BRIEF_VIDEO_EVAL_SCENARIOS = [
  {
    fidelityMode: 'off' as const,
    id: 'video-unbranded-p-video',
    model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    objective: 'a product spinning on a table',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-guided-minimax',
    model: MODEL_KEYS.REPLICATE_MINIMAX_H3,
    objective: 'slow push-in on the bottle',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-veo',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    objective: 'waves hitting a cliff at dusk',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-sora',
    model: MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
    objective: 'a city street in rain',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-kling-i2v',
    model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    objective: 'the product turns to camera',
    references: [{ assetId: 'frame-1', role: 'first_frame' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-wan-t2v',
    model: MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V,
    objective: 'fog moving through pine trees',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-seedance',
    model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
    objective: 'handheld walk through a studio',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-hailuo',
    model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    objective: 'macro pour of honey',
    references: [{ assetId: 'frame-2', role: 'first_frame' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-grok-imagine',
    model: MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
    objective: 'neon alley tracking shot',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-pixverse',
    model: MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6,
    objective: 'a skateboard kickflip in slow motion',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-runway',
    model: MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5,
    objective: 'drone over a coastline',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-dialogue',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    objective: 'two founders talking at a table',
  },
] as const;
