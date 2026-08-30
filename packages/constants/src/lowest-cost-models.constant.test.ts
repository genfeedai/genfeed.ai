import { describe, expect, it } from 'vitest';
import { AGENT_CHAT_MODEL_KEYS } from './agent-chat-models.constant';
import {
  CLOUD_QUALITY_IMAGE_MODEL_KEY,
  CLOUD_QUALITY_VIDEO_MODEL_KEY,
  getFallbackAgentChatModelKey,
  getFallbackImageModelKey,
  getFallbackVideoModelKey,
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
  type LowestCostModelDefaultsInput,
  shouldUseLowestCostModelDefaults,
} from './lowest-cost-models.constant';
import { MODEL_KEYS } from './model-keys.constant';

describe('lowest-cost model keys', () => {
  it('pins the cheapest curated image, video, and chat keys', () => {
    expect(LOWEST_COST_IMAGE_MODEL_KEY).toBe(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    );
    expect(LOWEST_COST_VIDEO_MODEL_KEY).toBe(
      MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    );
    expect(LOWEST_COST_AGENT_CHAT_MODEL_KEY).toBe(
      AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
    );
  });

  it('pins cloud-production quality image and video keys', () => {
    expect(CLOUD_QUALITY_IMAGE_MODEL_KEY).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE,
    );
    expect(CLOUD_QUALITY_VIDEO_MODEL_KEY).toBe(MODEL_KEYS.REPLICATE_MINIMAX_H3);
  });
});

describe('shouldUseLowestCostModelDefaults', () => {
  it('accepts the named LowestCostModelDefaultsInput contract', () => {
    const input: LowestCostModelDefaultsInput = {
      isCloud: true,
      nodeEnv: 'production',
    };

    expect(shouldUseLowestCostModelDefaults(input)).toBe(false);
  });

  it('is true for local development even when GENFEED_CLOUD is on', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
        nodeEnv: 'development',
      }),
    ).toBe(true);
  });

  it('is true for test / e2e so CI never bills flagship rates', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
        nodeEnv: 'test',
      }),
    ).toBe(true);
  });

  it('is true for self-hosted production (operator pays the provider)', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: false,
        nodeEnv: 'production',
      }),
    ).toBe(true);
  });

  it('is true for cloud staging so preview deploys stay on cheapest keys', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
        nodeEnv: 'staging',
      }),
    ).toBe(true);
  });

  it('is true when nodeEnv is unset, even on cloud', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
      }),
    ).toBe(true);
  });

  it('is false only for cloud production', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
        nodeEnv: 'production',
      }),
    ).toBe(false);
  });
});

describe('deployment fallback media keys', () => {
  it('uses Nano Banana 2 Lite and MiniMax H3 for cloud production', () => {
    const input: LowestCostModelDefaultsInput = {
      isCloud: true,
      nodeEnv: 'production',
    };

    expect(getFallbackImageModelKey(input)).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE,
    );
    expect(getFallbackVideoModelKey(input)).toBe(
      MODEL_KEYS.REPLICATE_MINIMAX_H3,
    );
    expect(getFallbackAgentChatModelKey(input)).toBe(
      AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
    );
  });

  it('uses lowest-cost keys for cloud staging', () => {
    const input: LowestCostModelDefaultsInput = {
      isCloud: true,
      nodeEnv: 'staging',
    };

    expect(getFallbackImageModelKey(input)).toBe(LOWEST_COST_IMAGE_MODEL_KEY);
    expect(getFallbackVideoModelKey(input)).toBe(LOWEST_COST_VIDEO_MODEL_KEY);
    expect(getFallbackAgentChatModelKey(input)).toBe(
      LOWEST_COST_AGENT_CHAT_MODEL_KEY,
    );
  });

  it('uses lowest-cost keys when nodeEnv is unset', () => {
    const input: LowestCostModelDefaultsInput = { isCloud: true };

    expect(getFallbackImageModelKey(input)).toBe(LOWEST_COST_IMAGE_MODEL_KEY);
    expect(getFallbackVideoModelKey(input)).toBe(LOWEST_COST_VIDEO_MODEL_KEY);
    expect(getFallbackAgentChatModelKey(input)).toBe(
      LOWEST_COST_AGENT_CHAT_MODEL_KEY,
    );
  });
});
