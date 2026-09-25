import { MODEL_KEYS } from '@genfeedai/contracts/constants';

const OPENROUTER_TEXT_MODELS = new Set<string>([
  MODEL_KEYS.OPENROUTER_XAI_GROK_4,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_FAST,
]);

export function isOpenRouterTextModel(model: string): boolean {
  return OPENROUTER_TEXT_MODELS.has(model) || model.startsWith('x-ai/');
}
