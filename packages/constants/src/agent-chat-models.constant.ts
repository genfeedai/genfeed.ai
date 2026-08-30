import { CostTier } from '@genfeedai/enums';

import { MODEL_KEYS } from './model-keys.constant';

/**
 * Canonical agent chat model catalogue.
 *
 * This is the single source of truth for which models the agent may run on,
 * what they cost, and how they are labelled. The API bills against it and the
 * model picker renders from it — never hand-maintain a second list.
 *
 * Pricing is provider list price (OpenRouter) in USD per million tokens.
 * Credits are *derived* from that pricing, never typed by hand.
 */

export interface AgentChatModelPricing {
  /** USD per 1M completion tokens. */
  completionPerMillion: number;
  /** USD per 1M prompt tokens. */
  promptPerMillion: number;
}

export interface AgentChatModel {
  brandSlug: string;
  /** Derived from `pricing` — credits burned per LLM round. */
  creditCostPerRound: number;
  costTier: CostTier;
  description: string;
  /**
   * Every route this key can pick costs $0, so billing zero credits is exact.
   * Declared, never inferred from a zero `pricing`: an uncurated definition is
   * also zero-priced, and treating that as free is how a round goes unbilled.
   */
  isFree?: boolean;
  isReasoning?: boolean;
  /** Self-hosted models run on our own fleet: platform cost, never per-user. */
  isSelfHosted?: boolean;
  key: string;
  label: string;
  pricing: AgentChatModelPricing;
}

/** 1 credit = $0.01 of retail spend. */
export const AGENT_CREDIT_USD = 0.01;

/** Retail multiplier over provider list price (70% margin). */
export const AGENT_CREDIT_MARGIN_MULTIPLIER = 1.7;

/**
 * Token envelope of a single LLM round (one request/response pair inside a
 * turn). A turn may run up to AGENT_MAX_TOOL_ROUNDS of these, which is exactly
 * why billing is per round and not per turn.
 */
export const AGENT_ROUND_PROMPT_TOKENS = 10_000;
export const AGENT_ROUND_COMPLETION_TOKENS = 2_000;

/**
 * Credits burned by one round on a model with the given list price.
 * Always at least 1 credit so no round is silently free.
 */
export function calculateAgentRoundCredits(
  pricing: AgentChatModelPricing,
): number {
  const promptUsd =
    (AGENT_ROUND_PROMPT_TOKENS / 1_000_000) * pricing.promptPerMillion;
  const completionUsd =
    (AGENT_ROUND_COMPLETION_TOKENS / 1_000_000) * pricing.completionPerMillion;
  const retailUsd =
    (promptUsd + completionUsd) * AGENT_CREDIT_MARGIN_MULTIPLIER;

  return Math.max(1, Math.ceil(retailUsd / AGENT_CREDIT_USD));
}

function resolveCostTier(creditCostPerRound: number): CostTier {
  if (creditCostPerRound <= 2) {
    return CostTier.LOW;
  }
  if (creditCostPerRound <= 8) {
    return CostTier.MEDIUM;
  }
  return CostTier.HIGH;
}

/**
 * Literal OpenRouter/local model ids. This is the only place agent chat model
 * key strings are written — definitions, defaults, retirements, and catalog
 * flags must reference these members (never inline `"provider/model"`).
 */
export const AGENT_CHAT_MODEL_KEYS = {
  CLAUDE_OPUS_5: 'anthropic/claude-opus-5',
  CLAUDE_SONNET_5: 'anthropic/claude-sonnet-5',
  DEEPSEEK_V4_FLASH: 'deepseek/deepseek-v4-flash-0731',
  GEMINI_2_5_FLASH_LITE: 'google/gemini-2.5-flash-lite',
  GEMINI_3_5_FLASH_LITE: 'google/gemini-3.5-flash-lite',
  GEMINI_3_6_FLASH: 'google/gemini-3.6-flash',
  GPT_5_6_LUNA: 'openai/gpt-5.6-luna',
  GPT_5_6_SOL: 'openai/gpt-5.6-sol',
  GPT_5_6_TERRA: 'openai/gpt-5.6-terra',
  GROK_4_6: 'x-ai/grok-4.6',
  KIMI_K3: 'moonshotai/kimi-k3',
  LOCAL_MISTRAL_SMALL: 'local/mistral-small',
  LOCAL_QWEN_32B: 'local/qwen-32b',
  NEMOTRON_3_ULTRA_FREE: 'nvidia/nemotron-3-ultra-550b-a55b:free',
} as const;

export type AgentChatModelKey =
  (typeof AGENT_CHAT_MODEL_KEYS)[keyof typeof AGENT_CHAT_MODEL_KEYS];

/**
 * Named LLM defaults. Bump a role here — every provider and background job
 * follows. Services must import these members instead of copying
 * `'provider/model'` strings.
 *
 * `grokFast` is the cheap xAI key used by the Twitter opportunity pipeline.
 * It is deliberately not in the agent chat picker; do not retire it onto the
 * frontier Grok row (that is how `grok-4-fast` became a silent 10x bill).
 */
export const LLM_DEFAULTS = {
  /**
   * Agent picker / chat turns (OpenRouter). Pinned to one concrete free model
   * — not the `openrouter/free` auto-router — so chat performance is
   * trackable against a stable model instead of a random free-tier draw.
   */
  agentChat: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
  /** Background scoring, intel, launch copy. */
  background: AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
  /** xAI / Grok jobs (trends, X realtime). */
  grok: AGENT_CHAT_MODEL_KEYS.GROK_4_6,
  /** Cheap Grok for high-frequency X drafts. Not in the picker. */
  grokFast: MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
  /** High-frequency volume agent types and mechanical compression. */
  volumeAgent: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
  /** Creative agent types, captions, planning, insights. */
  creativeAgent: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  /** Fast cheap text — drafts, newsletters, workflow LLM nodes, vision scoring. */
  fastText: AGENT_CHAT_MODEL_KEYS.GPT_5_6_LUNA,
  /** Content planning and long-form reasoning jobs. */
  planning: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  /** Featured / recommended step-up in pickers (not the default). */
  highlighted: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
  /** Org-owned inference fleet. */
  localFleet: AGENT_CHAT_MODEL_KEYS.LOCAL_QWEN_32B,
  /** When a `local/` model is requested but no GPU fleet is configured. */
  selfHostedFallback: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
} as const;

interface AgentChatModelDefinition {
  brandSlug: string;
  description: string;
  /** See {@link AgentChatModel.isFree} — only a $0-constrained route may set it. */
  isFree?: boolean;
  isReasoning?: boolean;
  isSelfHosted?: boolean;
  key: AgentChatModelKey;
  label: string;
  pricing: AgentChatModelPricing;
}

const AGENT_CHAT_MODEL_DEFINITIONS: AgentChatModelDefinition[] = [
  {
    brandSlug: 'nvidia',
    description:
      'Default daily driver — $0 chat, reasoning-capable, ~1M context',
    isFree: true,
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
    label: 'Nemotron 3 Ultra (Free)',
    pricing: { completionPerMillion: 0, promptPerMillion: 0 },
  },
  {
    brandSlug: 'deepseek-ai',
    description: 'Cheapest capable chat — everyday questions and drafting',
    key: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
    label: 'DeepSeek V4 Flash',
    pricing: { completionPerMillion: 0.18, promptPerMillion: 0.09 },
  },
  {
    brandSlug: 'google',
    description:
      'Default daily driver via OpenRouter — fast Flash-Lite, cheap tool turns',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
    label: 'Gemini 2.5 Flash Lite',
    // OpenRouter live (2026-08-07): $0.10 / $0.40 per 1M
    pricing: { completionPerMillion: 0.4, promptPerMillion: 0.1 },
  },
  {
    brandSlug: 'openai',
    description: 'Fast and cheap — short chat turns and quick edits',
    key: AGENT_CHAT_MODEL_KEYS.GPT_5_6_LUNA,
    label: 'GPT-5.6 Luna',
    pricing: { completionPerMillion: 0.6, promptPerMillion: 0.1 },
  },
  {
    brandSlug: 'google',
    description: 'Stronger Flash Lite for light agentic work',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GEMINI_3_5_FLASH_LITE,
    label: 'Gemini 3.5 Flash Lite',
    // OpenRouter live (2026-08-07): $0.30 / $2.50 per 1M
    pricing: { completionPerMillion: 2.5, promptPerMillion: 0.3 },
  },
  {
    brandSlug: 'openai',
    description: 'Balanced for heavier agentic work',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
    label: 'GPT-5.6 Terra',
    pricing: { completionPerMillion: 6, promptPerMillion: 1 },
  },
  {
    brandSlug: 'x-ai',
    description: 'Real-time knowledge, fast responses',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GROK_4_6,
    label: 'Grok 4.6',
    pricing: { completionPerMillion: 6, promptPerMillion: 2 },
  },
  {
    brandSlug: 'google',
    description: 'Fast agentic reasoning with a large context window',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GEMINI_3_6_FLASH,
    label: 'Gemini 3.6 Flash',
    pricing: { completionPerMillion: 7.5, promptPerMillion: 1.5 },
  },
  {
    brandSlug: 'anthropic',
    description: 'Balanced intelligence for long multi-step work',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
    label: 'Claude Sonnet 5',
    pricing: { completionPerMillion: 10, promptPerMillion: 2 },
  },
  {
    brandSlug: 'moonshotai',
    description: 'Agentic reasoning and multimodal work',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.KIMI_K3,
    label: 'Kimi K3',
    pricing: { completionPerMillion: 15, promptPerMillion: 3 },
  },
  {
    brandSlug: 'anthropic',
    description: 'Most capable — reserve for hard planning and review',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
    label: 'Claude Opus 5',
    pricing: { completionPerMillion: 25, promptPerMillion: 5 },
  },
  {
    brandSlug: 'openai',
    description: 'Deepest reasoning — expensive, use deliberately',
    isReasoning: true,
    key: AGENT_CHAT_MODEL_KEYS.GPT_5_6_SOL,
    label: 'GPT-5.6 Sol',
    pricing: { completionPerMillion: 30, promptPerMillion: 5 },
  },
  {
    brandSlug: 'genfeed-ai',
    description: 'Runs on our own fleet — no credit cost',
    isSelfHosted: true,
    key: AGENT_CHAT_MODEL_KEYS.LOCAL_QWEN_32B,
    label: 'Qwen 32B (self-hosted)',
    pricing: { completionPerMillion: 0, promptPerMillion: 0 },
  },
  {
    brandSlug: 'genfeed-ai',
    description: 'Runs on our own fleet — no credit cost',
    isSelfHosted: true,
    key: AGENT_CHAT_MODEL_KEYS.LOCAL_MISTRAL_SMALL,
    label: 'Mistral Small (self-hosted)',
    pricing: { completionPerMillion: 0, promptPerMillion: 0 },
  },
];

export const AGENT_CHAT_MODELS: AgentChatModel[] =
  AGENT_CHAT_MODEL_DEFINITIONS.map((definition) => {
    // Self-hosted rounds bill the platform, declared-free rounds bill nobody.
    // Everything else goes through the pricing formula, whose 1-credit floor
    // catches a definition that shipped without prices instead of gifting it.
    const creditCostPerRound =
      definition.isSelfHosted || definition.isFree
        ? 0
        : calculateAgentRoundCredits(definition.pricing);

    return {
      ...definition,
      costTier: resolveCostTier(creditCostPerRound),
      creditCostPerRound,
    };
  });

const AGENT_CHAT_MODELS_BY_KEY = new Map(
  AGENT_CHAT_MODELS.map((model) => [model.key, model]),
);

/**
 * Default agent chat model (OpenRouter). Alias of {@link LLM_DEFAULTS.agentChat}
 * so existing imports keep working.
 */
export const DEFAULT_AGENT_CHAT_MODEL_KEY = LLM_DEFAULTS.agentChat;

/**
 * Featured / recommended step-up in pickers (not the default).
 * Keep separate so "highlighted" never drifts from a hard-coded string.
 */
export const HIGHLIGHTED_AGENT_CHAT_MODEL_KEY = LLM_DEFAULTS.highlighted;

/** Default when the org runs its own inference fleet. */
export const LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY = LLM_DEFAULTS.localFleet;

/** xAI / Grok default. Alias of {@link LLM_DEFAULTS.grok}. */
export const DEFAULT_GROK_MODEL_KEY = LLM_DEFAULTS.grok;

/**
 * Model keys that are no longer offered. Persisted rows (org settings, brand
 * agent config, thread bindings, scheduled runs) still carry them, so every
 * read path maps them forward instead of failing or falling back to a price
 * that no longer reflects what the provider charges.
 *
 * `openrouter/auto` is retired on purpose: it let OpenRouter pick any model at
 * any price while we billed the cheapest tier. `openrouter/free` is now retired
 * for the same class of reason: every model it could pick was $0, so billing it
 * at zero credits was exact, but OpenRouter still swapped the underlying model
 * per request — chat performance could never be attributed to one model. It
 * maps to a single pinned free model (Nemotron 3 Ultra) so chat runs on a
 * stable, trackable model instead of a random free-tier draw.
 *
 * **A successor preserves price tier, not brand.** These are not aliases — a
 * retired key is a dead model, and the successor is whatever currently does its
 * job at its cost. Brand-matching is how `x-ai/grok-4-fast` ($0.20/$0.50) came
 * to point at Grok 4.6 ($2/$6): the only xAI row in the catalogue, so it looked
 * right and silently moved every stale binding onto a 10x model. Cross-brand is
 * normal here — `openai/gpt-4o-mini` and `openai/o4-mini` both resolve to
 * Gemini 2.5 Flash Lite, and `openrouter/free` resolves to Nemotron 3 Ultra
 * (NVIDIA), for the same reason: match price tier (free → free), not brand.
 *
 * Map *values* must always be {@link AGENT_CHAT_MODEL_KEYS} members.
 * Map *keys* are historical aliases (only place retired strings may appear).
 */
export const RETIRED_AGENT_CHAT_MODELS: Record<string, AgentChatModelKey> = {
  'anthropic/claude-opus-4-6': AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
  'anthropic/claude-sonnet-4-5': AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  'anthropic/claude-sonnet-4-5-20250514': AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  'anthropic/claude-sonnet-4-5-20250929': AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  'anthropic/claude-sonnet-4.5': AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
  'deepseek/deepseek-chat': AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
  'google/gemini-3-flash-preview': AGENT_CHAT_MODEL_KEYS.GEMINI_3_6_FLASH,
  'moonshotai/kimi-k2.5': AGENT_CHAT_MODEL_KEYS.KIMI_K3,
  'openai/gpt-4o': AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
  'openai/gpt-4o-mini': AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
  'openai/o3': AGENT_CHAT_MODEL_KEYS.GPT_5_6_SOL,
  'openai/o4-mini': AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
  'openrouter/auto': DEFAULT_AGENT_CHAT_MODEL_KEY,
  'openrouter/auto-beta': DEFAULT_AGENT_CHAT_MODEL_KEY,
  'openrouter/free': AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
  'x-ai/grok-4': AGENT_CHAT_MODEL_KEYS.GROK_4_6,
  'x-ai/grok-4.5': AGENT_CHAT_MODEL_KEYS.GROK_4_6,
  'x-ai/grok-4-fast': AGENT_CHAT_MODEL_KEYS.GEMINI_2_5_FLASH_LITE,
};

/**
 * Maps any stored/requested model key onto a key in the current catalogue.
 * Unknown keys are returned untouched so a newly added provider model still
 * runs (it bills at the fallback round cost until it is catalogued).
 */
export function resolveAgentChatModelKey(key?: string | null): string {
  const trimmed = key?.trim();
  if (!trimmed) {
    return DEFAULT_AGENT_CHAT_MODEL_KEY;
  }

  return RETIRED_AGENT_CHAT_MODELS[trimmed] ?? trimmed;
}

export function getAgentChatModel(
  key?: string | null,
): AgentChatModel | undefined {
  const trimmed = key?.trim();
  if (!trimmed) {
    return undefined;
  }

  return (
    AGENT_CHAT_MODELS_BY_KEY.get(trimmed) ??
    AGENT_CHAT_MODELS_BY_KEY.get(resolveAgentChatModelKey(trimmed))
  );
}

/**
 * Round cost for a model that is not in the catalogue yet. Deliberately the
 * priciest catalogued model's rate rather than the pinned default's: the
 * default is a free model (round cost 0), and an unknown key is far more
 * likely to be a new frontier release than a bargain — under-billing it is
 * the exact failure `openrouter/auto` shipped.
 */
export const AGENT_FALLBACK_ROUND_CREDITS: number = Math.max(
  4,
  ...AGENT_CHAT_MODELS.map((model) => model.creditCostPerRound),
);

/** Credits burned by one LLM round on the given model. */
export function getAgentChatModelRoundCredits(key?: string | null): number {
  const model = getAgentChatModel(key);
  if (model) {
    return model.creditCostPerRound;
  }

  return AGENT_FALLBACK_ROUND_CREDITS;
}

export function isRetiredAgentChatModel(key?: string | null): boolean {
  const trimmed = key?.trim();

  return Boolean(trimmed && trimmed in RETIRED_AGENT_CHAT_MODELS);
}

/** Models offered in the picker — self-hosted entries are surfaced separately. */
export const SELECTABLE_AGENT_CHAT_MODELS: AgentChatModel[] =
  AGENT_CHAT_MODELS.filter((model) => !model.isSelfHosted);
