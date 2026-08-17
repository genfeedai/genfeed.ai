import { describe, expect, it } from 'vitest';
import { AGENT_CHAT_MODEL_KEYS } from './agent-chat-models.constant';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
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
      AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
    );
  });
});

describe('shouldUseLowestCostModelDefaults', () => {
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

  it('is false only for cloud production', () => {
    expect(
      shouldUseLowestCostModelDefaults({
        isCloud: true,
        nodeEnv: 'production',
      }),
    ).toBe(false);
  });
});
