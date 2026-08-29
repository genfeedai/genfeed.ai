import { AGENT_CHAT_MODEL_KEYS } from './agent-chat-models.constant';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * Named input for lowest-cost vs cloud-quality model default selection.
 *
 * Cloud production (`isCloud` + `nodeEnv === 'production'`) keeps quality
 * defaults. Every other combination — local, self-hosted, e2e, cloud staging,
 * and an unset `NODE_ENV` — uses the lowest-cost keys.
 */
export interface LowestCostModelDefaultsInput {
  isCloud: boolean;
  nodeEnv?: string;
}

/**
 * Lowest-cost models for local, self-hosted, and e2e.
 *
 * Cloud production keeps the quality catalogue defaults (Nano Banana 2 Lite,
 * MiniMax H3, Gemini 2.5 Flash Lite). Everything else — community
 * installs, cloud staging, an unset `NODE_ENV`, `NODE_ENV=development`,
 * and `NODE_ENV=test` — should land on these keys so a generate / chat
 * turn does not bill flagship rates.
 *
 * Prices are Replicate / OpenRouter list (reviewed 2026-08):
 * - image: FLUX Schnell $0.003/image (Nano Banana 2 Lite is $0.034)
 * - video: P-Video $0.02/s at 720p (MiniMax H3 is up to $0.13/s at 2K)
 * - chat: Nemotron 3 Ultra (pinned free) $0 (Gemini Flash Lite is $0.10/$0.40)
 */
export const LOWEST_COST_IMAGE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL;

export const LOWEST_COST_VIDEO_MODEL_KEY = MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO;

export const LOWEST_COST_AGENT_CHAT_MODEL_KEY =
  AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE;

export const CLOUD_QUALITY_IMAGE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE;

export const CLOUD_QUALITY_VIDEO_MODEL_KEY = MODEL_KEYS.REPLICATE_MINIMAX_H3;

/**
 * When true, seed / UI / non-prod fallbacks must use the lowest-cost keys.
 * Cloud production (`isCloud` + `NODE_ENV=production`) keeps quality defaults.
 */
export function shouldUseLowestCostModelDefaults(
  input: LowestCostModelDefaultsInput,
): boolean {
  if (input.nodeEnv === 'development' || input.nodeEnv === 'test') {
    return true;
  }

  return !(input.isCloud && input.nodeEnv === 'production');
}

/** Empty-registry image fallback for the given deployment. */
export function getFallbackImageModelKey(
  input: LowestCostModelDefaultsInput,
): string {
  return shouldUseLowestCostModelDefaults(input)
    ? LOWEST_COST_IMAGE_MODEL_KEY
    : CLOUD_QUALITY_IMAGE_MODEL_KEY;
}

/** Empty-registry video fallback for the given deployment. */
export function getFallbackVideoModelKey(
  input: LowestCostModelDefaultsInput,
): string {
  return shouldUseLowestCostModelDefaults(input)
    ? LOWEST_COST_VIDEO_MODEL_KEY
    : CLOUD_QUALITY_VIDEO_MODEL_KEY;
}

/** Empty-registry agent chat fallback for the given deployment. */
export function getFallbackAgentChatModelKey(
  input: LowestCostModelDefaultsInput,
): string {
  return shouldUseLowestCostModelDefaults(input)
    ? LOWEST_COST_AGENT_CHAT_MODEL_KEY
    : AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE;
}
