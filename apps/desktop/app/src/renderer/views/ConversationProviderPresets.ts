import type { DesktopGenerationProviderKind } from '@genfeedai/desktop-contracts';

export const PROVIDER_PRESETS: Record<
  DesktopGenerationProviderKind,
  {
    baseUrl: string;
    displayName: string;
    model: string;
  }
> = {
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    displayName: 'LM Studio',
    model: 'local-model',
  },
  fal: {
    baseUrl: 'https://queue.fal.run',
    displayName: 'fal.ai',
    model: 'fal-ai/any-llm',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    displayName: 'Ollama',
    model: 'llama3.1',
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8000/v1',
    displayName: 'OpenAI-compatible',
    model: 'gpt-4o-mini',
  },
  replicate: {
    baseUrl: 'https://api.replicate.com/v1',
    displayName: 'Replicate',
    model: 'meta/llama-2-70b-chat',
  },
};
