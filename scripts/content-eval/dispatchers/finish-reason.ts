import type { EvalFinishReason } from '../contracts';

/**
 * Providers spell the token-limit stop `length` (OpenAI, OpenRouter) or
 * `max_tokens` (Anthropic); anything unrecognised is `other`.
 */
export function toEvalFinishReason(
  raw: string | null | undefined,
): EvalFinishReason | null {
  switch (raw) {
    case undefined:
    case null:
    case '':
      return null;
    case 'stop':
    case 'end_turn':
    case 'tool_calls':
      return 'stop';
    case 'length':
    case 'max_tokens':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'other';
  }
}
