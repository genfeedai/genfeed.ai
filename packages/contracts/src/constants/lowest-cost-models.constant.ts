import { AGENT_CHAT_MODEL_KEYS } from './agent-chat-models.constant';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * Named input for lowest-cost vs cloud-quality model default selection.
 *
 * Production keeps quality defaults, including self-hosted production.
 * Every other combination — local development, e2e, cloud staging,
 * and an unset `NODE_ENV` — uses the lowest-cost keys.
 */
export interface LowestCostModelDefaultsInput {
  isCloud: boolean;
  nodeEnv?: string;
}

/**
 * Lowest-cost models for development, staging, and e2e.
 *
 * Production keeps the quality media catalogue defaults (Nano Banana 2
 * Lite and MiniMax H3). Everything else — cloud staging,
 * an unset `NODE_ENV`, `NODE_ENV=development`,
 * and `NODE_ENV=test` — should land on these keys so a generate / chat
 * turn does not bill flagship rates.
 *
 * Prices are Replicate / OpenRouter list (reviewed 2026-09):
 * - image: FLUX Schnell $0.003/image (Nano Banana 2 Lite is $0.034)
 * - video: P-Video $0.02/s at 720p (MiniMax H3 is up to $0.13/s at 2K)
 * - chat: DeepSeek V4 Flash $0.05/$0.16 per 1M tokens
 */
export const LOWEST_COST_IMAGE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL;

export const LOWEST_COST_VIDEO_MODEL_KEY = MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO;

export const LOWEST_COST_AGENT_CHAT_MODEL_KEY =
  AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH;

export const CLOUD_QUALITY_IMAGE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE;

export const CLOUD_QUALITY_VIDEO_MODEL_KEY = MODEL_KEYS.REPLICATE_MINIMAX_H3;

/**
 * When true, seed / UI / non-prod fallbacks must use the lowest-cost keys.
 * Production (`NODE_ENV=production`) keeps quality defaults on every deployment.
 */
export function shouldUseLowestCostModelDefaults(
  input: LowestCostModelDefaultsInput,
): boolean {
  return input.nodeEnv !== 'production';
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
    : AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH;
}
