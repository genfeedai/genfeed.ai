import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  AGENT_CHAT_MODEL_KEYS,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  RETIRED_AGENT_CHAT_MODELS,
  SELECTABLE_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
} from './lowest-cost-models.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import {
  AGENT_CHAT_CAPABILITY,
  getModelCatalogForDeployment,
  UNIFIED_MODEL_CATALOG,
} from './model-catalog.constant';
import { MODEL_KEYS } from './model-keys.constant';

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
      // A stale binding must never bill at zero by accident. Zero is only
      // legitimate when the successor is declared free — then the row must
      // carry the deliberate `isFree` marker.
      if (row?.isFree) {
        expect(row.cost).toBe(0);
      } else {
        expect(row?.cost).toBeGreaterThan(0);
      }
    }
  });

  // A zero-cost active row is either a model the provider genuinely gives away
  // or a row whose price we forgot to curate — and the two are indistinguishable
  // from `cost` alone. `isFree` is the deliberate marker, so an unpriced row
  // still fails here instead of quietly handing out free rounds.
  it('never activates a row without a price unless it is marked free', () => {
    const unpricedActiveRows = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.isActive && entry.cost <= 0 && !entry.isFree,
    );

    expect(unpricedActiveRows).toEqual([]);
  });

  it('marks the zero-cost pinned default free rather than leaving it unpriced', () => {
    const freeRow = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.key === AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
    );

    expect(freeRow?.isFree).toBe(true);
    expect(freeRow?.isActive).toBe(true);
    expect(freeRow?.cost).toBe(0);
  });

  // Only a $0-constrained route may carry the marker. Anything else wearing it
  // would be an under-bill wearing the exemption that exists to prevent one.
  it('marks no priced row free', () => {
    const mispricedFreeRows = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.isFree && entry.cost > 0,
    );

    expect(mispricedFreeRows).toEqual([]);
  });

  it('seeds Nano Banana 2 Lite as the cloud image default', () => {
    const imageDefaults = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.category === ModelCategory.IMAGE && entry.isDefault,
    );

    expect(imageDefaults).toHaveLength(1);
    expect(imageDefaults[0]?.key).toBe('google/nano-banana-2-lite');
    expect(imageDefaults[0]?.isActive).toBe(true);
    expect(imageDefaults[0]?.provider).toBe(ModelProvider.REPLICATE);
    expect(imageDefaults[0]?.providerCostUsd).toBe(0.034);
  });

  it('seeds MiniMax H3 as the cloud video default with provider USD for live margin', () => {
    const videoDefaults = UNIFIED_MODEL_CATALOG.filter(
      (entry) => entry.category === ModelCategory.VIDEO && entry.isDefault,
    );

    expect(videoDefaults).toHaveLength(1);
    expect(videoDefaults[0]?.key).toBe('minimax/h3');
    expect(videoDefaults[0]?.isActive).toBe(true);
    expect(videoDefaults[0]?.pricingType).toBe('per-second');
    // Bill time multiplies this USD/s by duration then applyMargin(admin).
    expect(videoDefaults[0]?.providerCostUsd).toBe(0.13);
  });

  it('activates Gemini Omni Flash through the collision-safe fal partner key', () => {
    const row = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.key === MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
    );

    expect(row).toMatchObject({
      aspectRatios: ['16:9', '9:16'],
      defaultDuration: 8,
      durations: [3, 4, 5, 6, 7, 8, 9, 10],
      isActive: true,
      key: 'fal/google/gemini-omni-flash',
      label: 'Gemini Omni Flash',
      maxReferences: 3,
      pricingType: 'per-second',
      provider: ModelProvider.FAL,
      providerCostUsd: 0.13,
    });
    expect(row).not.toHaveProperty('hasEndFrame');
    expect(row).not.toHaveProperty('hasResolutionOptions');
  });

  it('promotes lowest-cost image, video, and chat defaults off cloud production', () => {
    const catalog = getModelCatalogForDeployment(false);
    const imageDefaults = catalog.filter(
      (entry) => entry.category === ModelCategory.IMAGE && entry.isDefault,
    );
    const videoDefaults = catalog.filter(
      (entry) => entry.category === ModelCategory.VIDEO && entry.isDefault,
    );
    const chatDefaults = catalog.filter(
      (entry) =>
        entry.capabilities?.includes(AGENT_CHAT_CAPABILITY) && entry.isDefault,
    );

    expect(imageDefaults).toHaveLength(1);
    expect(imageDefaults[0]?.key).toBe(LOWEST_COST_IMAGE_MODEL_KEY);
    expect(imageDefaults[0]?.isActive).toBe(true);
    expect(imageDefaults[0]?.providerCostUsd).toBe(0.003);

    expect(videoDefaults).toHaveLength(1);
    expect(videoDefaults[0]?.key).toBe(LOWEST_COST_VIDEO_MODEL_KEY);
    expect(videoDefaults[0]?.isActive).toBe(true);
    expect(videoDefaults[0]?.providerCostUsd).toBe(0.02);

    expect(chatDefaults).toHaveLength(1);
    expect(chatDefaults[0]?.key).toBe(LOWEST_COST_AGENT_CHAT_MODEL_KEY);
    expect(chatDefaults[0]?.isActive).toBe(true);
  });

  it('keeps cloud quality defaults when isCloudQualityDefaultsEnabled is true', () => {
    expect(getModelCatalogForDeployment(true)).toBe(UNIFIED_MODEL_CATALOG);
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
