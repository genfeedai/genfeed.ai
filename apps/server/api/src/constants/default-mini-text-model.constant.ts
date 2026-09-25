import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

/**
 * Default model for short product text (draft posts, hooks, light transforms).
 * Text completions go through OpenRouter. Uses the cheap Grok key reserved
 * for high-frequency X drafts, not the frontier Grok picker row.
 */
export const DEFAULT_MINI_TEXT_MODEL = LLM_DEFAULTS.grokFast;
