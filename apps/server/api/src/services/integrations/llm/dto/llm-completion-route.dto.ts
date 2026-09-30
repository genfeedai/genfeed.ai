export interface ILlmCompletionRoute {
  modelKey: string;
  provider: 'anthropic' | 'openai' | 'openrouter' | 'local';
  isByok: boolean;
  isAvailable: boolean;
}
