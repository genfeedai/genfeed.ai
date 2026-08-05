import { CostTier } from '@genfeedai/enums';

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

interface AgentChatModelDefinition {
  brandSlug: string;
  description: string;
  isReasoning?: boolean;
  isSelfHosted?: boolean;
  key: string;
  label: string;
  pricing: AgentChatModelPricing;
}

const AGENT_CHAT_MODEL_DEFINITIONS: AgentChatModelDefinition[] = [
  {
    brandSlug: 'deepseek-ai',
    description: 'Cheapest capable chat — everyday questions and drafting',
    key: 'deepseek/deepseek-v4-flash-0731',
    label: 'DeepSeek V4 Flash',
    pricing: { completionPerMillion: 0.18, promptPerMillion: 0.09 },
  },
  {
    brandSlug: 'openai',
    description: 'Fast and cheap — short chat turns and quick edits',
    key: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    pricing: { completionPerMillion: 0.6, promptPerMillion: 0.1 },
  },
  {
    brandSlug: 'google',
    description: 'Low-cost reasoning for light tool use',
    isReasoning: true,
    key: 'google/gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    pricing: { completionPerMillion: 2.5, promptPerMillion: 0.3 },
  },
  {
    brandSlug: 'openai',
    description: 'Balanced default for agentic work',
    isReasoning: true,
    key: 'openai/gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    pricing: { completionPerMillion: 6, promptPerMillion: 1 },
  },
  {
    brandSlug: 'x-ai',
    description: 'Real-time knowledge, fast responses',
    isReasoning: true,
    key: 'x-ai/grok-4.5',
    label: 'Grok 4.5',
    pricing: { completionPerMillion: 6, promptPerMillion: 2 },
  },
  {
    brandSlug: 'google',
    description: 'Fast agentic reasoning with a large context window',
    isReasoning: true,
    key: 'google/gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    pricing: { completionPerMillion: 7.5, promptPerMillion: 1.5 },
  },
  {
    brandSlug: 'anthropic',
    description: 'Balanced intelligence for long multi-step work',
    isReasoning: true,
    key: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    pricing: { completionPerMillion: 10, promptPerMillion: 2 },
  },
  {
    brandSlug: 'moonshotai',
    description: 'Agentic reasoning and multimodal work',
    isReasoning: true,
    key: 'moonshotai/kimi-k3',
    label: 'Kimi K3',
    pricing: { completionPerMillion: 15, promptPerMillion: 3 },
  },
  {
    brandSlug: 'anthropic',
    description: 'Most capable — reserve for hard planning and review',
    isReasoning: true,
    key: 'anthropic/claude-opus-5',
    label: 'Claude Opus 5',
    pricing: { completionPerMillion: 25, promptPerMillion: 5 },
  },
  {
    brandSlug: 'openai',
    description: 'Deepest reasoning — expensive, use deliberately',
    isReasoning: true,
    key: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    pricing: { completionPerMillion: 30, promptPerMillion: 5 },
  },
  {
    brandSlug: 'genfeed-ai',
    description: 'Runs on our own fleet — no credit cost',
    isSelfHosted: true,
    key: 'local/qwen-32b',
    label: 'Qwen 32B (self-hosted)',
    pricing: { completionPerMillion: 0, promptPerMillion: 0 },
  },
  {
    brandSlug: 'genfeed-ai',
    description: 'Runs on our own fleet — no credit cost',
    isSelfHosted: true,
    key: 'local/mistral-small',
    label: 'Mistral Small (self-hosted)',
    pricing: { completionPerMillion: 0, promptPerMillion: 0 },
  },
];

export const AGENT_CHAT_MODELS: AgentChatModel[] =
  AGENT_CHAT_MODEL_DEFINITIONS.map((definition) => {
    const creditCostPerRound = definition.isSelfHosted
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

/** Default agent chat model — capable enough for tool use, cheap enough for chat. */
export const DEFAULT_AGENT_CHAT_MODEL_KEY = 'openai/gpt-5.6-terra';

/** Default when the org runs its own inference fleet. */
export const LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY = 'local/qwen-32b';

/**
 * Model keys that are no longer offered. Persisted rows (org settings, brand
 * agent config, thread bindings, scheduled runs) still carry them, so every
 * read path maps them forward instead of failing or falling back to a price
 * that no longer reflects what the provider charges.
 *
 * `openrouter/auto` is retired on purpose: it let OpenRouter pick any model at
 * any price while we billed the cheapest tier.
 */
export const RETIRED_AGENT_CHAT_MODELS: Record<string, string> = {
  'anthropic/claude-opus-4-6': 'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-5',
  'deepseek/deepseek-chat': 'deepseek/deepseek-v4-flash-0731',
  'google/gemini-3-flash-preview': 'google/gemini-3.6-flash',
  'moonshotai/kimi-k2.5': 'moonshotai/kimi-k3',
  'openai/gpt-4o': 'openai/gpt-5.6-terra',
  'openai/o3': 'openai/gpt-5.6-sol',
  'openai/o4-mini': 'openai/gpt-5.6-luna',
  'openrouter/auto': DEFAULT_AGENT_CHAT_MODEL_KEY,
  'openrouter/auto-beta': DEFAULT_AGENT_CHAT_MODEL_KEY,
  'x-ai/grok-4-fast': 'x-ai/grok-4.5',
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
 * default model's price rather than 1 credit: an unknown model is far more
 * likely to be a new frontier release than a bargain, and under-billing it is
 * the exact failure `openrouter/auto` shipped.
 */
export const AGENT_FALLBACK_ROUND_CREDITS: number =
  AGENT_CHAT_MODELS_BY_KEY.get(DEFAULT_AGENT_CHAT_MODEL_KEY)
    ?.creditCostPerRound ?? 4;

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
