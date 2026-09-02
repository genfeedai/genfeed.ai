import { CostTier } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  SELECTABLE_AGENT_CHAT_MODELS,
} from '@genfeedai/contracts/constants';

export interface OpenRouterToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenRouterTool {
  type: 'function';
  function: OpenRouterToolFunction;
}

export interface OpenRouterToolCallResponse {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenRouterPlugin {
  id: string;
  allowed_models?: string[];
  cost_tier?: 'high' | 'low' | 'max' | 'medium' | 'xhigh';
  engine?: 'exa' | 'firecrawl' | 'native' | 'parallel';
  exclude_domains?: string[];
  include_domains?: string[];
  max_results?: number;
  search_prompt?: string;
}

export interface OpenRouterMessageContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | OpenRouterMessageContentPart[];
  tool_calls?: OpenRouterToolCallResponse[];
  tool_call_id?: string;
}

/**
 * OpenRouter per-request provider routing. Documented vendor fields only:
 * https://openrouter.ai/docs/guides/features/zdr
 * https://openrouter.ai/docs/guides/routing/provider-selection
 */
export type OpenRouterDataCollectionPolicy = 'allow' | 'deny';

export interface OpenRouterProviderPreferences {
  allow_fallbacks?: boolean;
  data_collection: OpenRouterDataCollectionPolicy;
  require_parameters?: boolean;
  zdr: boolean;
}

export const OPENROUTER_FIRST_PARTY_PROVIDER_POLICY = {
  data_collection: 'deny',
  zdr: true,
} as const satisfies OpenRouterProviderPreferences;

export interface OpenRouterChatCompletionParams {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  plugins?: OpenRouterPlugin[];
  session_id?: string;
  provider?: OpenRouterProviderPreferences;
  stream?: boolean;
  tools?: OpenRouterTool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
}

export interface OpenRouterChatCompletionResponse {
  id: string;
  model?: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenRouterToolCallResponse[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /** Exact provider charge in USD when reported by OpenRouter. */
    cost?: number;
    cost_source?: 'generation' | 'usage';
    is_byok?: boolean;
  };
}

export interface OpenRouterStreamToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

export interface OpenRouterStreamChunk {
  id: string;
  model?: string;
  choices: Array<{
    delta: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: OpenRouterStreamToolCallDelta[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

/**
 * Callback invoked with each incremental text delta as it streams from the
 * provider. Awaited between chunks so downstream fan-out preserves token order.
 */
export type OpenRouterStreamTokenHandler = (delta: string) => Promise<void>;

export enum OpenRouterModelTier {
  FAST = 'fast',
  STANDARD = 'standard',
  PREMIUM = 'premium',
}

/**
 * Tiered model lists, derived from the canonical catalogue so a one-off prompt
 * never routes to a model we have retired. Tiers map onto the catalogue's own
 * cost tiers — cheapest first within each, so `getDefaultModel` picks the
 * cheapest model that clears the tier.
 */
function modelKeysForCostTier(costTier: CostTier): string[] {
  return SELECTABLE_AGENT_CHAT_MODELS.filter(
    (model) => model.costTier === costTier,
  )
    .sort((left, right) => left.creditCostPerRound - right.creditCostPerRound)
    .map((model) => model.key);
}

export const OPENROUTER_MODELS: Record<OpenRouterModelTier, string[]> = {
  [OpenRouterModelTier.FAST]: modelKeysForCostTier(CostTier.LOW),
  [OpenRouterModelTier.STANDARD]: modelKeysForCostTier(CostTier.MEDIUM),
  [OpenRouterModelTier.PREMIUM]: modelKeysForCostTier(CostTier.HIGH),
};

export function getDefaultModel(tier: OpenRouterModelTier): string {
  return OPENROUTER_MODELS[tier][0] ?? DEFAULT_AGENT_CHAT_MODEL_KEY;
}
