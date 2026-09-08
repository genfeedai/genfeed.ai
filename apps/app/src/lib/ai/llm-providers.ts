/**
 * LLM provider configuration for the conversational workflow assistant.
 * Separate from content generation providers (Replicate, fal, etc.).
 * These are the providers available for the chat-based workflow builder.
 */

export type LLMProviderType = 'anthropic' | 'openai' | 'replicate';

export interface LLMProviderConfig {
  apiKey: string | null;
  enabled: boolean;
  defaultModel: string;
}

export const DEFAULT_LLM_PROVIDER: LLMProviderType = 'anthropic';
export const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';
