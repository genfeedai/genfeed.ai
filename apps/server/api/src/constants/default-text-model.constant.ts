import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

/**
 * Default model for longer product text (articles, evaluations, replies).
 * Text completions go through OpenRouter. Replicate stays image/video/voice.
 */
export const DEFAULT_TEXT_MODEL = LLM_DEFAULTS.planning;
