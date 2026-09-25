import { LLM_DEFAULTS, MODEL_KEYS } from '@genfeedai/contracts/constants';

const OPENROUTER_TEXT_MODELS = new Set<string>([
  LLM_DEFAULTS.background,
  LLM_DEFAULTS.creativeAgent,
  LLM_DEFAULTS.fastText,
  LLM_DEFAULTS.grok,
  LLM_DEFAULTS.grokFast,
  LLM_DEFAULTS.planning,
  LLM_DEFAULTS.volumeAgent,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_FAST,
  MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
  MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1,
  MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
  MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
  MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT,
  MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2,
]);

const OPENROUTER_TEXT_PREFIXES = [
  'anthropic/',
  'deepseek-ai/',
  'deepseek/',
  'google/gemini',
  'moonshotai/',
  'nvidia/',
  'openrouter/',
  'x-ai/',
] as const;

function isOpenAiTextModel(model: string): boolean {
  return (
    model.startsWith('openai/') &&
    !model.includes('gpt-image') &&
    !model.includes('sora')
  );
}

/**
 * Text LLM keys that must complete through OpenRouter.
 * Image, video, and voice stay on Replicate.
 */
export function isOpenRouterTextModel(model: string): boolean {
  return (
    OPENROUTER_TEXT_MODELS.has(model) ||
    isOpenAiTextModel(model) ||
    OPENROUTER_TEXT_PREFIXES.some((prefix) => model.startsWith(prefix))
  );
}
