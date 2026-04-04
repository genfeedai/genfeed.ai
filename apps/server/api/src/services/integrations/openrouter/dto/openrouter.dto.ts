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

export interface OpenRouterChatCompletionParams {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  plugins?: OpenRouterPlugin[];
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
  };
}

export interface OpenRouterStreamChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export enum OpenRouterModelTier {
  FAST = 'fast',
  STANDARD = 'standard',
  PREMIUM = 'premium',
}

export const OPENROUTER_MODELS: Record<OpenRouterModelTier, string[]> = {
  [OpenRouterModelTier.FAST]: [
    'deepseek/deepseek-chat',
    'google/gemini-2.0-flash-exp',
    'x-ai/grok-4.1-fast',
  ],
  [OpenRouterModelTier.STANDARD]: [
    'anthropic/claude-sonnet-4-5-20250929',
    'openai/gpt-4o',
  ],
  [OpenRouterModelTier.PREMIUM]: ['anthropic/claude-opus-4-6', 'openai/o3'],
};

export function getDefaultModel(tier: OpenRouterModelTier): string {
  return OPENROUTER_MODELS[tier][0];
}
