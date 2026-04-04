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

export interface LLMProviderInfo {
  name: string;
  description: string;
  docsUrl: string;
  keyPlaceholder: string;
  keyPrefix: string;
  models: LLMModelOption[];
}

export interface LLMModelOption {
  id: string;
  label: string;
  description: string;
}

export const LLM_PROVIDERS: Record<LLMProviderType, LLMProviderInfo> = {
  anthropic: {
    description: 'Claude models — best for reasoning, tool use, and creative workflows',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    models: [
      {
        description: 'Most capable — deep reasoning and complex workflows',
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6',
      },
      {
        description: 'Best balance of speed and capability',
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
      },
      {
        description: 'Fastest — great for quick edits and simple tasks',
        id: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5',
      },
    ],
    name: 'Anthropic',
  },
  openai: {
    description: 'GPT models — versatile and widely supported',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    keyPrefix: 'sk-',
    models: [
      {
        description: 'Most capable GPT model',
        id: 'gpt-4.1',
        label: 'GPT-4.1',
      },
      {
        description: 'Fast and cost-effective',
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
      },
      {
        description: 'Optimized for reasoning tasks',
        id: 'o3-mini',
        label: 'o3-mini',
      },
    ],
    name: 'OpenAI',
  },
  replicate: {
    description: 'Open-source models via Replicate (Llama, DeepSeek)',
    docsUrl: 'https://replicate.com/account/api-tokens',
    keyPlaceholder: 'r8_...',
    keyPrefix: 'r8_',
    models: [
      {
        description: 'Meta Llama 3.1 — strong open-source model',
        id: 'meta/meta-llama-3.1-405b-instruct',
        label: 'Llama 3.1 405B',
      },
      {
        description: 'Efficient reasoning model',
        id: 'deepseek-ai/deepseek-r1',
        label: 'DeepSeek R1',
      },
    ],
    name: 'Replicate',
  },
};

export const DEFAULT_LLM_PROVIDER: LLMProviderType = 'anthropic';
export const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';
