import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  RETIRED_AGENT_CHAT_MODELS,
  SELECTABLE_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import {
  AGENT_CHAT_CAPABILITY,
  UNIFIED_MODEL_CATALOG,
} from './model-catalog.constant';

const agentRows = UNIFIED_MODEL_CATALOG.filter((entry) =>
  entry.capabilities?.includes(AGENT_CHAT_CAPABILITY),
);

describe('UNIFIED_MODEL_CATALOG', () => {
  it('includes media and agent chat models with unique keys', () => {
    expect(UNIFIED_MODEL_CATALOG.length).toBeGreaterThan(50);

    const keys = UNIFIED_MODEL_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes image, video and text categories for settings filters', () => {
    const categories = new Set(
      UNIFIED_MODEL_CATALOG.map((entry) => entry.category),
    );

    expect(categories.has(ModelCategory.IMAGE)).toBe(true);
    expect(categories.has(ModelCategory.VIDEO)).toBe(true);
    expect(categories.has(ModelCategory.TEXT)).toBe(true);
  });

  it('seeds every agent chat row as TEXT', () => {
    expect(agentRows.length).toBeGreaterThanOrEqual(
      SELECTABLE_AGENT_CHAT_MODELS.length,
    );
    expect(
      agentRows.every((entry) => entry.category === ModelCategory.TEXT),
    ).toBe(true);
  });

  it('activates exactly the selectable agent chat models', () => {
    const activeAgentKeys = agentRows
      .filter((entry) => entry.isActive)
      .map((entry) => entry.key)
      .sort();

    expect(activeAgentKeys).toEqual(
      SELECTABLE_AGENT_CHAT_MODELS.map((model) => model.key).sort(),
    );
  });

  it('seeds self-hosted chat models inactive so operators opt in', () => {
    const selfHostedRows = agentRows.filter(
      (entry) => entry.provider === ModelProvider.GENFEED_AI,
    );

    expect(selfHostedRows.length).toBeGreaterThan(0);
    expect(selfHostedRows.every((entry) => entry.isActive === false)).toBe(
      true,
    );
  });

  it('marks a single default agent chat model', () => {
    const defaults = agentRows.filter((entry) => entry.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.key).toBe(DEFAULT_AGENT_CHAT_MODEL_KEY);
    expect(defaults[0]?.isActive).toBe(true);
  });

  // A retired key that is also registered as a live media capability wins the
  // catalog dedup and silently suppresses its own legacy row — the key then
  // reads as an active, billable model. Assert at the registration so the
  // failure names the stale entry rather than the missing row.
  it('never registers a retired chat key as a live media capability', () => {
    for (const key of Object.keys(RETIRED_AGENT_CHAT_MODELS)) {
      expect(MODEL_OUTPUT_CAPABILITIES).not.toHaveProperty(key);
    }
  });

  it('seeds retired chat keys as legacy rows pointing at their successor', () => {
    for (const [key, succeededBy] of Object.entries(
      RETIRED_AGENT_CHAT_MODELS,
    )) {
      const row = UNIFIED_MODEL_CATALOG.find((entry) => entry.key === key);

      expect(row).toBeDefined();

      expect(row?.isLegacy).toBe(true);
      expect(row?.isActive).toBe(false);
      expect(row?.succeededBy).toBe(succeededBy);
      // A stale binding must never bill at zero.
      expect(row?.cost).toBeGreaterThan(0);
    }
  });

  it('never activates a row without a price', () => {
    const freeActiveRows = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.isActive && entry.cost <= 0,
    );

    expect(freeActiveRows).toEqual([]);
  });

  it('seeds Seedance 2.5 as the default video model with provider USD for live margin', () => {
    const videoDefaults = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.category === ModelCategory.VIDEO && entry.isDefault,
    );

    expect(videoDefaults).toHaveLength(1);
    expect(videoDefaults[0]?.key).toBe('bytedance/seedance-2.5');
    expect(videoDefaults[0]?.isActive).toBe(true);
    expect(videoDefaults[0]?.pricingType).toBe('per-second');
    // Bill time multiplies this USD/s by duration then applyMargin(admin).
    expect(videoDefaults[0]?.providerCostUsd).toBeGreaterThanOrEqual(0.2);
  });

  it('seeds curated media rows with providerCostUsd for live-margin billing', () => {
    const curatedWithUsd = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.isActive && entry.providerCostUsd != null,
    );
    expect(curatedWithUsd.length).toBeGreaterThanOrEqual(5);
    for (const row of curatedWithUsd) {
      expect(row.providerCostUsd).toBeGreaterThan(0);
    }
  });
});
