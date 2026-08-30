/**
 * Unified model catalog — the single seed source for the `Model` registry.
 *
 * Combines the curated inputs into one list of registry rows:
 * - media generation keys from MODEL_OUTPUT_CAPABILITIES (image/video/voice/…)
 * - curated media defaults (label/cost/isDefault) from SELF_HOSTED_MODELS
 * - agent chat LLMs from AGENT_CHAT_MODELS (category TEXT)
 * - one legacy row per retired chat key, so a stored binding always resolves to
 *   a registry row instead of falling off the catalogue
 *
 * Settings → Models, the agent picker and the routers read the DB rows that
 * start from this list; provider discovery adds drafts on top. These constants
 * are seed *input* only — never a parallel runtime allowlist.
 */
import type { CostTier } from '@genfeedai/enums';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import {
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  getAgentChatModel,
  RETIRED_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
} from './lowest-cost-models.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { SELF_HOSTED_MODELS } from './self-hosted-models.constant';

/** Marker in `capabilities` so the agent picker can identify chat models. */
export const AGENT_CHAT_CAPABILITY = 'agent-chat';

export interface ModelCatalogSeedEntry {
  aspectRatios?: readonly string[];
  capabilities?: readonly string[];
  category: ModelCategory;
  config?: Readonly<Record<string, string>>;
  cost: number;
  /** Credits per second (or per megapixel) when pricingType is not FLAT. */
  costPerUnit?: number;
  costTier?: CostTier;
  defaultAspectRatio?: string;
  defaultDuration?: number;
  description: string;
  durations?: readonly number[];
  hasAudioToggle?: boolean;
  hasDurationEditing?: boolean;
  hasEndFrame?: boolean;
  hasInterpolation?: boolean;
  hasResolutionOptions?: boolean;
  hasSpeech?: boolean;
  inputCostPerMillionTokens?: number;
  isActive: boolean;
  isBatchSupported?: boolean;
  isDefault?: boolean;
  /**
   * The provider charges nothing for this row, so `cost: 0` is its real price
   * rather than a missing one. Without the marker a zero-cost active row is
   * treated as uncurated and fails the catalog's no-free-activation guard.
   */
  isFree?: boolean;
  isHighlighted?: boolean;
  isImagenModel?: boolean;
  isLegacy?: boolean;
  isPublic?: boolean;
  isReferencesMandatory?: boolean;
  key: string;
  label: string;
  maxOutputs?: number;
  maxReferences?: number;
  /** Floor credits charged for a run (legacy path only). */
  minCost?: number;
  outputCostPerMillionTokens?: number;
  /** How `cost` / `costPerUnit` / `providerCostUsd` are interpreted at bill time. */
  pricingType?: string;
  provider: ModelProvider;
  /**
   * Raw provider list price in USD. Preferred bill-time input for
   * `applyMargin` (live admin margin). Unit follows pricingType
   * (per run, per second, or per megapixel).
   */
  providerCostUsd?: number;
  recommendedFor?: readonly string[];
  succeededBy?: string;
  supportsFeatures?: readonly string[];
  usesOrientation?: boolean;
}

/** `supportsFeatures` marker for chat models that reason before answering. */
export const REASONING_FEATURE = 'reasoning';

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

const CURATED_MEDIA_BY_KEY = new Map<
  string,
  (typeof SELF_HOSTED_MODELS)[number]
>(SELF_HOSTED_MODELS.map((model) => [model.key, model]));

/**
 * Every media key we know how to call, so Settings → Models lists the real
 * catalogue rather than the four curated defaults.
 *
 * Only curated keys carry a price, and `Model.cost` is what generation bills
 * against — so an uncurated key is seeded present but inactive. Activating one
 * at cost 0 would hand out free generations.
 */
function buildMediaCatalogEntries(): ModelCatalogSeedEntry[] {
  return Object.entries(MODEL_OUTPUT_CAPABILITIES).map(([key, capability]) => {
    const curated = CURATED_MEDIA_BY_KEY.get(key);
    const isCurated = Boolean(curated);

    const entry: ModelCatalogSeedEntry = {
      category: capability.category,
      cost: curated?.cost ?? 0,
      description:
        curated?.description ?? `${labelFromKey(key)} (${capability.category})`,
      isActive: isCurated,
      isDefault: curated?.isDefault ?? false,
      isHighlighted: curated?.isHighlighted ?? false,
      isLegacy: false,
      isPublic: isCurated,
      key,
      label: curated?.label ?? labelFromKey(key),
      provider: curated?.provider ?? providerFromMediaKey(key),
    };

    if (curated?.costTier) {
      entry.costTier = curated.costTier;
    }
    if (curated && 'costPerUnit' in curated && curated.costPerUnit != null) {
      entry.costPerUnit = curated.costPerUnit;
    }
    if (curated && 'minCost' in curated && curated.minCost != null) {
      entry.minCost = curated.minCost;
    }
    if (curated && 'pricingType' in curated && curated.pricingType) {
      entry.pricingType = curated.pricingType;
    }
    if (
      curated &&
      'providerCostUsd' in curated &&
      curated.providerCostUsd != null
    ) {
      entry.providerCostUsd = curated.providerCostUsd;
    }
    if (curated?.providerConfig) {
      entry.config = curated.providerConfig;
    }
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
    if ('hasAudioToggle' in capability) {
      entry.hasAudioToggle = capability.hasAudioToggle;
    }
    if ('hasDurationEditing' in capability) {
      entry.hasDurationEditing = capability.hasDurationEditing;
    }
    if ('hasEndFrame' in capability) {
      entry.hasEndFrame = capability.hasEndFrame;
    }
    if ('hasInterpolation' in capability) {
      entry.hasInterpolation = capability.hasInterpolation;
    }
    if ('hasResolutionOptions' in capability) {
      entry.hasResolutionOptions = capability.hasResolutionOptions;
    }
    if ('hasSpeech' in capability) {
      entry.hasSpeech = capability.hasSpeech;
    }
    entry.isBatchSupported = capability.isBatchSupported;
    if ('isImagenModel' in capability) {
      entry.isImagenModel = capability.isImagenModel;
    }
    if ('isReferencesMandatory' in capability) {
      entry.isReferencesMandatory = capability.isReferencesMandatory;
    }
    if (typeof capability.maxOutputs === 'number') {
      entry.maxOutputs = capability.maxOutputs;
    }
    if (typeof capability.maxReferences === 'number') {
      entry.maxReferences = capability.maxReferences;
    }
    if ('usesOrientation' in capability) {
      entry.usesOrientation = capability.usesOrientation;
    }

    return entry;
  });
}

/**
 * Agent chat models as TEXT registry rows.
 *
 * Self-hosted entries get a row but stay inactive: they only resolve on an
 * install running its own inference fleet, so activation is an operator toggle
 * rather than a cloud default. Seeding them anyway is what makes that toggle
 * possible at all.
 */
function buildAgentCatalogEntries(): ModelCatalogSeedEntry[] {
  return AGENT_CHAT_MODELS.map((model) => {
    const isDefault = model.key === DEFAULT_AGENT_CHAT_MODEL_KEY;
    const isSelfHosted = Boolean(model.isSelfHosted);

    return {
      capabilities: [AGENT_CHAT_CAPABILITY],
      category: ModelCategory.TEXT,
      cost: model.creditCostPerRound,
      costTier: model.costTier,
      description: model.description,
      inputCostPerMillionTokens: model.pricing.promptPerMillion,
      isActive: !isSelfHosted,
      isDefault,
      isHighlighted: isDefault,
      isLegacy: false,
      isPublic: !isSelfHosted,
      key: model.key,
      label: model.label,
      outputCostPerMillionTokens: model.pricing.completionPerMillion,
      provider: isSelfHosted
        ? ModelProvider.GENFEED_AI
        : ModelProvider.OPENROUTER,
      recommendedFor: [AGENT_CHAT_CAPABILITY],
      supportsFeatures: model.isReasoning ? [REASONING_FEATURE] : [],
      ...(model.isFree ? { isFree: true } : {}),
    } satisfies ModelCatalogSeedEntry;
  });
}

/**
 * Retired chat keys as legacy rows carrying `succeededBy`.
 *
 * Persisted rows (org settings, brand agent config, thread bindings, scheduled
 * runs) still hold these keys. A row priced at its successor keeps a stale
 * binding billable at what the run actually costs — an uncurated 0 would make
 * it free, which is the exact failure `openrouter/auto` shipped. When the
 * successor itself is a declared-free model, 0 IS the real cost, so the row
 * carries `isFree` to mark that price as curated rather than missing.
 */
function buildRetiredAgentCatalogEntries(): ModelCatalogSeedEntry[] {
  return Object.entries(RETIRED_AGENT_CHAT_MODELS).map(([key, succeededBy]) => {
    const successor = getAgentChatModel(succeededBy);

    return {
      capabilities: [AGENT_CHAT_CAPABILITY],
      category: ModelCategory.TEXT,
      cost: successor?.creditCostPerRound ?? AGENT_FALLBACK_ROUND_CREDITS,
      description: `Retired — superseded by ${successor?.label ?? succeededBy}`,
      isActive: false,
      isDefault: false,
      isHighlighted: false,
      isLegacy: true,
      isPublic: false,
      key,
      label: labelFromKey(key),
      provider: ModelProvider.OPENROUTER,
      succeededBy,
      ...(successor ? { costTier: successor.costTier } : {}),
      ...(successor?.isFree ? { isFree: true } : {}),
    } satisfies ModelCatalogSeedEntry;
  });
}

/**
 * Full catalog seed list, deduped by key. Live agent rows win over a media key
 * of the same name (they carry the chat billing metadata), and a retired key
 * never displaces a row that is still live.
 *
 * "Still live" means a live *agent* row — not merely a key the media
 * capability map also lists. `x-ai/grok-4-fast` is both a retired chat key and
 * a TEXT entry in `MODEL_OUTPUT_CAPABILITIES`, and an uncurated media row seeds
 * at cost 0 with no `succeededBy`. Letting that win would leave a stale chat
 * binding billing at zero — the exact failure the retired rows exist to stop.
 */
export const UNIFIED_MODEL_CATALOG: readonly ModelCatalogSeedEntry[] = (() => {
  const byKey = new Map<string, ModelCatalogSeedEntry>();
  const liveAgentKeys = new Set<string>();

  for (const entry of buildMediaCatalogEntries()) {
    byKey.set(entry.key, entry);
  }
  for (const entry of buildAgentCatalogEntries()) {
    byKey.set(entry.key, entry);
    liveAgentKeys.add(entry.key);
  }
  for (const entry of buildRetiredAgentCatalogEntries()) {
    if (!liveAgentKeys.has(entry.key)) {
      byKey.set(entry.key, entry);
    }
  }

  return [...byKey.values()];
})();

export const UNIFIED_MODEL_CATALOG_COUNT = UNIFIED_MODEL_CATALOG.length;

function applyLowestCostDefaults(
  catalog: readonly ModelCatalogSeedEntry[],
): ModelCatalogSeedEntry[] {
  return catalog.map((entry) => {
    if (entry.category === ModelCategory.IMAGE) {
      const isLowestCost = entry.key === LOWEST_COST_IMAGE_MODEL_KEY;

      return {
        ...entry,
        isActive: isLowestCost ? true : entry.isActive,
        isDefault: isLowestCost,
      };
    }

    if (entry.category === ModelCategory.VIDEO) {
      const isLowestCost = entry.key === LOWEST_COST_VIDEO_MODEL_KEY;

      return {
        ...entry,
        isActive: isLowestCost ? true : entry.isActive,
        isDefault: isLowestCost,
      };
    }

    if (entry.capabilities?.includes(AGENT_CHAT_CAPABILITY)) {
      const isLowestCost = entry.key === LOWEST_COST_AGENT_CHAT_MODEL_KEY;

      return {
        ...entry,
        isDefault: isLowestCost,
        isHighlighted: isLowestCost,
      };
    }

    return entry;
  });
}

/**
 * Catalogue the seed writes for a deployment.
 *
 * Cloud production keeps {@link UNIFIED_MODEL_CATALOG} quality defaults.
 * Local, self-hosted, and e2e (`isCloudQualityDefaultsEnabled === false`)
 * promote the lowest-cost image / video / chat rows so a generate does not
 * bill Seedance / Nano Banana / a mid-tier chat model.
 */
export function getModelCatalogForDeployment(
  isCloudQualityDefaultsEnabled: boolean,
): readonly ModelCatalogSeedEntry[] {
  if (isCloudQualityDefaultsEnabled) {
    return UNIFIED_MODEL_CATALOG;
  }

  return applyLowestCostDefaults(UNIFIED_MODEL_CATALOG);
}
