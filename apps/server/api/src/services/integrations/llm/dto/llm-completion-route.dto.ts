export interface ILlmCompletionRoute {
  modelKey: string;
  provider: 'anthropic' | 'openai' | 'openrouter';
  isByok: boolean;
  isAvailable: boolean;
}
