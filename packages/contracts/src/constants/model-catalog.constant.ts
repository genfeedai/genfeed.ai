/**
 * Unified model catalog — the single seed source for the `Model` registry.
 *
 * Combines the curated inputs into one list of registry rows:
 * - media generation keys from MODEL_OUTPUT_CAPABILITIES (image/video/voice/…)
 * - curated media defaults (label/cost/isDefault) from SELF_HOSTED_MODELS
 * - product-text fallbacks that are not agent-chat models
 * - agent chat LLMs from AGENT_CHAT_MODELS (category TEXT)
 * - one legacy row per retired chat key, so a stored binding always resolves to
 *   a registry row instead of falling off the catalogue
 *
 * Settings → Models, the agent picker and the routers read the DB rows that
 * start from this list; provider discovery adds drafts on top. These constants
 * are seed *input* only — never a parallel runtime allowlist.
 */
import {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '..';
import {
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentRoundCredits,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  HIGHLIGHTED_AGENT_CHAT_MODEL_KEY,
  RETIRED_AGENT_CHAT_MODEL_KEYS,
} from './agent-chat-models.constant';
import { BRAND_VISION_MODELS } from './brand-vision-models.constant';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
} from './lowest-cost-models.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { MODEL_KEYS } from './model-keys.constant';
import { SELF_HOSTED_MODELS } from './self-hosted-models.constant';

const KEY_SEPARATOR_RUNS_PATTERN = /[-_.]+/g;
const WORD_INITIALS_PATTERN = /\b\w/g;

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
  qualityTier?: QualityTier;
  speedTier?: SpeedTier;
  defaultAspectRatio?: string;
  defaultDuration?: number;
  description: string;
  /** Cheaper siblings a video draft runs on, tried in order. */
  draftModelKeys?: readonly string[];
  durations?: readonly number[];
  /** Exact provider endpoint when the collision-safe public key is prefixed. */
  endpoint?: string;
  /** Pinned provider identifier, e.g. a Replicate `owner/name:version`. */
  externalId?: string;
  hasAudioToggle?: boolean;
  hasDurationEditing?: boolean;
  hasEndFrame?: boolean;
  hasInterpolation?: boolean;
  hasNativeExtend?: boolean;
  hasResolutionOptions?: boolean;
  hasSpeech?: boolean;
  hasVideoReferences?: boolean;
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
  /**
   * The only legacy signal the catalog carries. The registry's `isLegacy`
   * flag is operator territory (it hides a retired key from the public
   * catalog) and is never seeded.
   */
  lifecycle: ModelLifecycle;
  isPublic?: boolean;
  isReferencesMandatory?: boolean;
  key: string;
  label: string;
  maxOutputs?: number;
  maxReferences?: number;
  maxVideoReferences?: number;
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
  supportsFeatures?: readonly string[];
  usesOrientation?: boolean;
}

/** `supportsFeatures` marker for chat models that reason before answering. */
export const REASONING_FEATURE = 'reasoning';

function labelFromKey(key: string): string {
  const leaf = key.split('/').pop() ?? key;

  return leaf
    .replace(KEY_SEPARATOR_RUNS_PATTERN, ' ')
    .replace(WORD_INITIALS_PATTERN, (char) => char.toUpperCase())
    .trim();
}

const MEDIA_LABEL_OVERRIDES: Record<string, string> = {
  [MODEL_KEYS.HEYGEN_VIDEO]: 'HeyGen Video',
  [MODEL_KEYS.HIGGSFIELD_GENJUTSU]: 'Genjutsu',
  [MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO]: 'Cinema Studio 4.0',
  [MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP]: 'Genjutsu Object Swap',
  [MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE]: 'Genjutsu Restyle',
  [MODEL_KEYS.HIGGSFIELD_ADS_STUDIO]: 'Ads Studio',
  [MODEL_KEYS.HIGGSFIELD_SOUL_STANDARD]: 'Soul Standard',
  [MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA]: 'Soul Cinema',
};

function providerFromMediaKey(key: string): ModelProvider {
  if (key.startsWith('fal-ai/') || key.startsWith('fal/')) {
    return ModelProvider.FAL;
  }
  if (key.startsWith('genfeed-ai/')) {
    return ModelProvider.GENFEED_AI;
  }
  if (key.startsWith('heygen/')) {
    return ModelProvider.HEYGEN;
  }
  if (key.startsWith('elevenlabs/')) {
    return ModelProvider.ELEVENLABS;
  }
  if (key.startsWith('higgsfield-ai/') || key.startsWith('higgsfield/')) {
    return ModelProvider.HIGGSFIELD;
  }

  return ModelProvider.REPLICATE;
}

const CURATED_MEDIA_BY_KEY = new Map<
  string,
  (typeof SELF_HOSTED_MODELS)[number]
>(SELF_HOSTED_MODELS.map((model) => [model.key, model]));

/** Hosted FLUX.1 stays legacy; explicit use still requires active, priced rows. */
const LEGACY_FLUX_MEDIA_KEYS: ReadonlySet<string> = new Set([
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_MAX,
  MODEL_KEYS.FAL_FLUX_SCHNELL,
  MODEL_KEYS.FAL_FLUX_DEV,
  MODEL_KEYS.FAL_FLUX_PRO,
]);

/**
 * Older versions of a family whose newer same-category model is in the
 * catalog. They stay selectable and keep their price; the picker labels them
 * Legacy (outdated). A legacy row has no successor and still runs.
 */
const LEGACY_MEDIA_KEYS: ReadonlySet<string> = new Set([
  MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
  MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
  MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
  MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
  MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
  MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
  MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
  MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
]);

/**
 * Models the provider no longer serves: Replicate returns 404, or, for text
 * keys that complete through OpenRouter, OpenRouter lists no endpoint (checked
 * 2026-10-15). A retired row is never offered or priced, and an explicit
 * choice of one stops with a clear message until the user picks a new model.
 */
const RETIRED_MEDIA_KEYS: ReadonlySet<string> = new Set([
  MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
  MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT,
  MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1,
  MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
  // Billed on input and output megapixels, which dispatch cannot meter; FLUX.2
  // Pro covers the same requests at an approved rate.
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX,
  // fal lists Stable Video Diffusion as `fal-ai/stable-video` with status
  // `deprecated` (checked 2026-11-01); the stored `-diffusion` id is not served.
  MODEL_KEYS.FAL_STABLE_VIDEO,
  // fal's sitemap and model pages no longer list `fal-ai/luma-dream-machine`
  // or its ray-2 variants (checked 2026-11-08); the fal price refresh failed
  // with model_fetch_failed for it.
  MODEL_KEYS.FAL_LUMA_DREAM_MACHINE,
  // The Genfeed GPU fleet that ran these is archived (2026-10-30), so they are
  // retired on every deployment.
  MODEL_KEYS.GENFEED_AI_FLUX_DEV,
  MODEL_KEYS.GENFEED_AI_FLUX_DEV_PULID,
  MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
  MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
  MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_LORA,
  MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_UPSCALE,
  MODEL_KEYS.GENFEED_AI_FLUX2_KLEIN,
  MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
  MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
]);

/**
 * fal moved these models to new endpoint ids, so the stored key answers 404
 * (checked 2026-11-01). The key stays and the refresh reads the live endpoint.
 */
const FAL_MOVED_ENDPOINTS: Readonly<Record<string, string>> = {
  [MODEL_KEYS.FAL_ELEVEN_LABS_TTS]: 'fal-ai/elevenlabs/tts/multilingual-v2',
  [MODEL_KEYS.FAL_SEEDANCE_2_0]: 'bytedance/seedance-2.0/text-to-video',
  [MODEL_KEYS.FAL_GPT_IMAGE_2]: 'openai/gpt-image-2',
  [MODEL_KEYS.FAL_RECRAFT_V4_PRO]: 'fal-ai/recraft/v4/pro/text-to-image',
  // fal splits Kling v3 by tier and mode. This key is the Pro text endpoint;
  // the Pro image and both Standard endpoints are registered under their own
  // endpoint ids (no move needed). PixVerse has only its text endpoint, so an
  // image-to-video request stays on Replicate.
  [MODEL_KEYS.FAL_KLING_VIDEO_V3_PRO]:
    'fal-ai/kling-video/v3/pro/text-to-video',
  [MODEL_KEYS.FAL_PIXVERSE_V6]: 'fal-ai/pixverse/v6/text-to-video',
};

function mediaLifecycle(
  key: string,
  curated: (typeof SELF_HOSTED_MODELS)[number] | undefined,
): ModelLifecycle {
  if (RETIRED_MEDIA_KEYS.has(key)) return ModelLifecycle.RETIRED;
  if (LEGACY_FLUX_MEDIA_KEYS.has(key) || LEGACY_MEDIA_KEYS.has(key))
    return ModelLifecycle.LEGACY;
  if (curated && 'lifecycle' in curated && curated.lifecycle)
    return curated.lifecycle;
  return curated?.isDefault || curated?.isHighlighted
    ? ModelLifecycle.RECOMMENDED
    : ModelLifecycle.AVAILABLE;
}

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
        curated?.description ??
        `${MEDIA_LABEL_OVERRIDES[key] ?? labelFromKey(key)} (${capability.category})`,
      ...(curated && 'endpoint' in curated && curated.endpoint
        ? { endpoint: curated.endpoint }
        : {}),
      // A curated row can opt out (`isActive: false`) and stay seeded inactive.
      isActive:
        isCurated &&
        !(curated && 'isActive' in curated && curated.isActive === false),
      isDefault: curated?.isDefault ?? false,
      isHighlighted: curated?.isHighlighted ?? false,
      lifecycle: mediaLifecycle(key, curated),
      isPublic: isCurated,
      key,
      label: curated?.label ?? MEDIA_LABEL_OVERRIDES[key] ?? labelFromKey(key),
      provider: curated?.provider ?? providerFromMediaKey(key),
    };

    if (curated && 'endpoint' in curated) entry.endpoint = curated.endpoint;
    const movedEndpoint = FAL_MOVED_ENDPOINTS[key];
    if (movedEndpoint && !entry.endpoint) entry.endpoint = movedEndpoint;
    if (curated?.costTier) {
      entry.costTier = curated.costTier;
    }
    if (curated && 'qualityTier' in curated && curated.qualityTier) {
      entry.qualityTier = curated.qualityTier;
    }
    if (curated && 'speedTier' in curated && curated.speedTier) {
      entry.speedTier = curated.speedTier;
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
    if ('hasNativeExtend' in capability) {
      entry.hasNativeExtend = capability.hasNativeExtend;
    }
    if ('hasVideoReferences' in capability) {
      entry.hasVideoReferences = capability.hasVideoReferences;
    }
    if (
      'maxVideoReferences' in capability &&
      typeof capability.maxVideoReferences === 'number'
    ) {
      entry.maxVideoReferences = capability.maxVideoReferences;
    }
    if ('draftModelKeys' in capability && capability.draftModelKeys) {
      entry.draftModelKeys = capability.draftModelKeys;
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
      qualityTier: model.qualityTier,
      speedTier: model.speedTier,
      description: model.description,
      inputCostPerMillionTokens: model.pricing.promptPerMillion,
      isActive: !isSelfHosted,
      isDefault,
      isHighlighted: isDefault,
      lifecycle:
        isDefault || model.key === HIGHLIGHTED_AGENT_CHAT_MODEL_KEY
          ? ModelLifecycle.RECOMMENDED
          : ModelLifecycle.AVAILABLE,
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
 * Gemini 3.8 Flash list price on OpenRouter (Google paid tier), read
 * 2026-10-14. Prompt $0.75 / completion $3.75 per 1M through 2026-12-31;
 * paid rates double on 2027-01-01. Since Gemini 4 Hydrogen took over product
 * text this is no longer a model's price: it is the basis of the flat product
 * text price below, kept so the customer price did not move with the model.
 */
const PRODUCT_TEXT_PRICE_BASIS = {
  completionPerMillion: 3.75,
  promptPerMillion: 0.75,
} as const;

/**
 * Gemini 4 Hydrogen list price on OpenRouter (Google AI Studio and Vertex),
 * read 2026-11-20. Prompt $1.50 / completion $7.50 per 1M. Billed at the flat
 * product text price, not per token, so the real cost per rewrite is read from
 * the ledger and the price revisited with data.
 */
const PRODUCT_TEXT_GEMINI_4_HYDROGEN_PRICING = {
  completionPerMillion: 7.5,
  promptPerMillion: 1.5,
} as const;

/**
 * Credits one post enhancement (AI Rewrite) is quoted and charged: the flat
 * `cost` of the product text rows, which `POST /posts/:postId/enhancements`
 * admits against. The composer prompt bar shows this figure, so the label
 * cannot drift from the hold.
 */
export const POST_ENHANCEMENT_CREDITS = calculateAgentRoundCredits(
  PRODUCT_TEXT_PRICE_BASIS,
);

/**
 * Gemini 4 Neon list price on OpenRouter (Google AI Studio and Vertex), read
 * 2026-11-20. Prompt $3 / completion $15 per 1M. The Vertex global endpoint
 * (ZDR-eligible) bills the same list price.
 */
const PRODUCT_TEXT_GEMINI_4_NEON_PRICING = {
  completionPerMillion: 15,
  promptPerMillion: 3,
} as const;

/** Grok 4.3 list price on OpenRouter, read 2026-10-15. */
const PRODUCT_TEXT_GROK_4_3_PRICING = {
  completionPerMillion: 2.5,
  promptPerMillion: 1.25,
} as const;

/**
 * Product-text fallbacks that `MODEL_OUTPUT_CAPABILITIES` also lists.
 *
 * Applied after the media pass so they replace the inactive cost-0 row, and
 * before agent chat so a real agent row of the same key still wins. They stay
 * out of the agent picker (no `agent-chat` capability), out of public model
 * lists, and off the category default.
 */
function buildProductTextCatalogEntries(): ModelCatalogSeedEntry[] {
  const pricing = PRODUCT_TEXT_PRICE_BASIS;

  return [
    {
      category: ModelCategory.TEXT,
      cost: POST_ENHANCEMENT_CREDITS,
      costTier: CostTier.MEDIUM,
      description:
        'Gemini 4 Hydrogen — product text for posts, captions, drafts, prompt enhancement and article review (`LLM_DEFAULTS.productTextFallback`). Not offered in the agent chat picker.',
      inputCostPerMillionTokens:
        PRODUCT_TEXT_GEMINI_4_HYDROGEN_PRICING.promptPerMillion,
      isActive: true,
      isDefault: false,
      isHighlighted: false,
      isPublic: false,
      key: MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_4_HYDROGEN,
      label: 'Gemini 4 Hydrogen',
      lifecycle: ModelLifecycle.AVAILABLE,
      outputCostPerMillionTokens:
        PRODUCT_TEXT_GEMINI_4_HYDROGEN_PRICING.completionPerMillion,
      pricingType: PricingType.FLAT,
      provider: ModelProvider.OPENROUTER,
      qualityTier: QualityTier.HIGH,
      speedTier: SpeedTier.FAST,
    },
    {
      category: ModelCategory.TEXT,
      cost: POST_ENHANCEMENT_CREDITS,
      costTier: CostTier.MEDIUM,
      description:
        'Gemini 3.8 Flash — the previous product text model. Not offered in the agent chat picker.',
      inputCostPerMillionTokens: pricing.promptPerMillion,
      isActive: true,
      isDefault: false,
      isHighlighted: false,
      isPublic: false,
      key: MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH,
      label: 'Gemini 3.8 Flash',
      lifecycle: ModelLifecycle.AVAILABLE,
      outputCostPerMillionTokens: pricing.completionPerMillion,
      pricingType: PricingType.FLAT,
      provider: ModelProvider.OPENROUTER,
      qualityTier: QualityTier.HIGH,
      speedTier: SpeedTier.FAST,
    },
    {
      category: ModelCategory.TEXT,
      cost: calculateAgentRoundCredits(PRODUCT_TEXT_GEMINI_4_NEON_PRICING),
      costTier: CostTier.MEDIUM,
      description:
        'Gemini 4 Neon — the content writing model for articles, newsletters, captions, scripts and rewrites (`LLM_DEFAULTS.contentWriting`). Not offered in the agent chat picker.',
      inputCostPerMillionTokens:
        PRODUCT_TEXT_GEMINI_4_NEON_PRICING.promptPerMillion,
      isActive: true,
      isDefault: false,
      isHighlighted: false,
      isPublic: false,
      key: MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_4_NEON,
      label: 'Gemini 4 Neon',
      lifecycle: ModelLifecycle.AVAILABLE,
      outputCostPerMillionTokens:
        PRODUCT_TEXT_GEMINI_4_NEON_PRICING.completionPerMillion,
      pricingType: PricingType.FLAT,
      provider: ModelProvider.OPENROUTER,
      qualityTier: QualityTier.HIGH,
      speedTier: SpeedTier.FAST,
    },
    {
      category: ModelCategory.TEXT,
      cost: calculateAgentRoundCredits(PRODUCT_TEXT_GROK_4_3_PRICING),
      costTier: CostTier.MEDIUM,
      description:
        'Grok 4.3 — the cheap xAI model behind X opportunity drafts. Not offered in the agent chat picker.',
      inputCostPerMillionTokens: PRODUCT_TEXT_GROK_4_3_PRICING.promptPerMillion,
      isActive: true,
      isDefault: false,
      isHighlighted: false,
      isPublic: false,
      key: MODEL_KEYS.OPENROUTER_XAI_GROK_4_3,
      label: 'Grok 4.3',
      lifecycle: ModelLifecycle.AVAILABLE,
      outputCostPerMillionTokens:
        PRODUCT_TEXT_GROK_4_3_PRICING.completionPerMillion,
      pricingType: PricingType.FLAT,
      provider: ModelProvider.OPENROUTER,
      qualityTier: QualityTier.STANDARD,
      speedTier: SpeedTier.FAST,
    },
  ];
}

/**
 * Brand visual analysis models (#6727) as TEXT registry rows tagged
 * `brand-ocr` / `brand-detection`. They are platform tooling an operator picks
 * in Admin → Platform settings: never public, never a category default and
 * only AVAILABLE, so the router (which routes RECOMMENDED rows) and the agent
 * picker (which needs the `agent-chat` tag) never offer them as generators.
 */
function buildBrandVisionCatalogEntries(): ModelCatalogSeedEntry[] {
  return BRAND_VISION_MODELS.map((model) => ({
    capabilities: [model.capability],
    category: ModelCategory.TEXT,
    config: model.providerConfig,
    // Credits are display and legacy fallbacks only; the price bills from
    // `providerCostUsd` per second of runtime, and this is never customer-billed.
    cost: 1,
    costPerUnit: 1,
    costTier: CostTier.LOW,
    description: model.description,
    externalId: model.externalId,
    isActive: true,
    isDefault: false,
    isHighlighted: false,
    isPublic: false,
    key: model.key,
    label: model.label,
    lifecycle: ModelLifecycle.AVAILABLE,
    minCost: 1,
    pricingType: model.pricingType,
    provider: model.provider,
    providerCostUsd: model.providerCostUsd,
    speedTier: SpeedTier.FAST,
  }));
}

/**
 * Retired chat keys as retired rows. Persisted rows (org settings, brand agent
 * config, thread bindings, scheduled runs) may still hold these keys, so the
 * row stays: an explicit choice of one stops with a clear message naming it.
 * A retired row is never deleted and never offered. It is inactive and carries
 * the priciest catalogued round cost so nothing can bill it as free.
 */
function buildRetiredAgentCatalogEntries(): ModelCatalogSeedEntry[] {
  return [...RETIRED_AGENT_CHAT_MODEL_KEYS].map(
    (key) =>
      ({
        capabilities: [AGENT_CHAT_CAPABILITY],
        category: ModelCategory.TEXT,
        cost: AGENT_FALLBACK_ROUND_CREDITS,
        description: 'Retired',
        isActive: false,
        isDefault: false,
        isHighlighted: false,
        lifecycle: ModelLifecycle.RETIRED,
        isPublic: false,
        key,
        label: labelFromKey(key),
        provider: ModelProvider.OPENROUTER,
      }) satisfies ModelCatalogSeedEntry,
  );
}

/**
 * Full catalog seed list, deduped by key. Live agent rows win over a media key
 * of the same name (they carry the chat billing metadata), and a retired key
 * never displaces a row that is still live.
 *
 * "Still live" means a live *agent* row — not merely a key the media
 * capability map also lists. `x-ai/grok-4-fast` is both a retired chat key and
 * a TEXT entry in `MODEL_OUTPUT_CAPABILITIES`, and an uncurated media row seeds
 * at cost 0. Letting that win would leave a stale chat
 * binding billing at zero — the exact failure the retired rows exist to stop.
 */
export const UNIFIED_MODEL_CATALOG: readonly ModelCatalogSeedEntry[] = (() => {
  const byKey = new Map<string, ModelCatalogSeedEntry>();
  const liveAgentKeys = new Set<string>();

  for (const entry of buildMediaCatalogEntries()) {
    byKey.set(entry.key, entry);
  }
  for (const entry of buildProductTextCatalogEntries()) {
    byKey.set(entry.key, entry);
  }
  for (const entry of buildAgentCatalogEntries()) {
    byKey.set(entry.key, entry);
    liveAgentKeys.add(entry.key);
  }
  for (const entry of buildBrandVisionCatalogEntries()) {
    byKey.set(entry.key, entry);
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
        ...(isLowestCost ? { lifecycle: ModelLifecycle.RECOMMENDED } : {}),
      };
    }

    if (entry.category === ModelCategory.VIDEO) {
      const isLowestCost = entry.key === LOWEST_COST_VIDEO_MODEL_KEY;

      return {
        ...entry,
        isActive: isLowestCost ? true : entry.isActive,
        isDefault: isLowestCost,
        ...(isLowestCost ? { lifecycle: ModelLifecycle.RECOMMENDED } : {}),
      };
    }

    if (entry.capabilities?.includes(AGENT_CHAT_CAPABILITY)) {
      const isLowestCost = entry.key === LOWEST_COST_AGENT_CHAT_MODEL_KEY;

      return {
        ...entry,
        isDefault: isLowestCost,
        isHighlighted: isLowestCost,
        ...(isLowestCost ? { lifecycle: ModelLifecycle.RECOMMENDED } : {}),
      };
    }

    return entry;
  });
}

/**
 * Catalogue the seed writes for a deployment.
 *
 * Production keeps {@link UNIFIED_MODEL_CATALOG} quality defaults.
 * Development, staging, and e2e (`isCloudQualityDefaultsEnabled === false`)
 * promote the lowest-cost image / video / chat rows so a generate does not
 * bill Seedance / Nano Banana / a mid-tier chat model.
 */
export function getModelCatalogForDeployment(
  isCloudQualityDefaultsEnabled: boolean,
): readonly ModelCatalogSeedEntry[] {
  return isCloudQualityDefaultsEnabled
    ? UNIFIED_MODEL_CATALOG
    : applyLowestCostDefaults(UNIFIED_MODEL_CATALOG);
}
