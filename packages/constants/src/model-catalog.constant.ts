/**
 * Unified model catalog — single seed source for the `Model` registry.
 *
 * Combines:
 * - Media generation keys from MODEL_OUTPUT_CAPABILITIES (image/video/voice/…)
 * - Agent chat LLMs from SELECTABLE_AGENT_CHAT_MODELS (category TEXT)
 * - Curated self-hosted image defaults (labels/cost/isDefault)
 *
 * Settings → Models, agent picker (TEXT), and routers all read DB rows that
 * start from this list. Discovery can still add drafts on top.
 */
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import {
  AGENT_CHAT_MODELS,
  SELECTABLE_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { SELF_HOSTED_MODELS } from './self-hosted-models.constant';

/** Marker in `capabilities` so agent picker can identify chat models. */
export const AGENT_CHAT_CAPABILITY = 'agent-chat';

export interface ModelCatalogSeedEntry {
  aspectRatios?: readonly string[];
  capabilities?: readonly string[];
  category: ModelCategory;
  cost: number;
  costTier?: string;
  defaultAspectRatio?: string;
  defaultDuration?: number;
  description: string;
  durations?: readonly number[];
  inputCostPerMillionTokens?: number;
  isActive: boolean;
  isDefault?: boolean;
  isHighlighted?: boolean;
  isLegacy?: boolean;
  isPublic?: boolean;
  key: string;
  label: string;
  maxOutputs?: number;
  maxReferences?: number;
  outputCostPerMillionTokens?: number;
  provider: ModelProvider;
  recommendedFor?: readonly string[];
}

function labelFromKey(key: string): string {
  const leaf = key.split('/').pop() ?? key;
  return leaf
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function providerFromMediaKey(key: string): ModelProvider {
  if (key.startsWith('fal-ai/') || key.startsWith('fal/')) {
    return ModelProvider.FAL;
  }
  if (key.startsWith('genfeed-ai/')) {
    return ModelProvider.GENFEED_AI;
  }
  return ModelProvider.REPLICATE;
}

const SELF_HOSTED_BY_KEY = new Map(
  SELF_HOSTED_MODELS.map((model) => [model.key, model] as const),
);

function buildMediaCatalogEntries(): ModelCatalogSeedEntry[] {
  return Object.entries(MODEL_OUTPUT_CAPABILITIES).map(([key, capability]) => {
    const selfHosted = SELF_HOSTED_BY_KEY.get(
      key as (typeof SELF_HOSTED_MODELS)[number]['key'],
    );
    const entry: ModelCatalogSeedEntry = {
      category: capability.category,
      cost: selfHosted?.cost ?? 0,
      description:
        selfHosted?.description ??
        `${labelFromKey(key)} (${capability.category})`,
      isActive: true,
      isDefault: selfHosted?.isDefault ?? false,
      isHighlighted: selfHosted?.isHighlighted ?? false,
      isLegacy: false,
      isPublic: true,
      key,
      label: selfHosted?.label ?? labelFromKey(key),
      provider: providerFromMediaKey(key),
    };

    if ('aspectRatios' in capability && capability.aspectRatios) {
      entry.aspectRatios = capability.aspectRatios;
    }
    if ('defaultAspectRatio' in capability && capability.defaultAspectRatio) {
      entry.defaultAspectRatio = capability.defaultAspectRatio;
    }
    if ('durations' in capability && capability.durations) {
      entry.durations = capability.durations;
    }
    if ('defaultDuration' in capability && capability.defaultDuration) {
      entry.defaultDuration = capability.defaultDuration;
    }
    if (typeof capability.maxOutputs === 'number') {
      entry.maxOutputs = capability.maxOutputs;
    }
    if (typeof capability.maxReferences === 'number') {
      entry.maxReferences = capability.maxReferences;
    }

    return entry;
  });
}

function buildAgentCatalogEntries(): ModelCatalogSeedEntry[] {
  const selectableKeys = new Set(
    SELECTABLE_AGENT_CHAT_MODELS.map((model) => model.key),
  );

  return AGENT_CHAT_MODELS.filter((model) => !model.isSelfHosted).map(
    (model) => {
      const isSelectable = selectableKeys.has(model.key);
      return {
        capabilities: [AGENT_CHAT_CAPABILITY],
        category: ModelCategory.TEXT,
        cost: model.creditCostPerRound,
        costTier: model.costTier,
        description: model.description,
        inputCostPerMillionTokens: model.pricing.promptPerMillion,
        isActive: isSelectable,
        isDefault: model.key === 'openai/gpt-5.6-terra',
        isHighlighted: model.key === 'openai/gpt-5.6-terra',
        isLegacy: !isSelectable,
        isPublic: true,
        key: model.key,
        label: model.label,
        outputCostPerMillionTokens: model.pricing.completionPerMillion,
        provider: ModelProvider.OPENROUTER,
        recommendedFor: isSelectable ? [AGENT_CHAT_CAPABILITY] : [],
      } satisfies ModelCatalogSeedEntry;
    },
  );
}

/**
 * Full catalog seed list. Media entries first, then agent TEXT models.
 * Keys are unique across both sources (agent keys are openrouter-style).
 */
export const UNIFIED_MODEL_CATALOG: readonly ModelCatalogSeedEntry[] = (() => {
  const byKey = new Map<string, ModelCatalogSeedEntry>();

  for (const entry of buildMediaCatalogEntries()) {
    byKey.set(entry.key, entry);
  }
  for (const entry of buildAgentCatalogEntries()) {
    // Agent TEXT models win on key collision (chat billing metadata).
    byKey.set(entry.key, entry);
  }

  return [...byKey.values()];
})();

export const UNIFIED_MODEL_CATALOG_COUNT = UNIFIED_MODEL_CATALOG.length;
