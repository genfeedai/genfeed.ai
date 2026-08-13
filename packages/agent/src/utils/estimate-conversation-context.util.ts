const CHARS_PER_TOKEN = 4;

/** Conservative default when the selected model does not publish a window. */
export const DEFAULT_AGENT_CONTEXT_WINDOW_TOKENS = 128_000;

export type ConversationContextUsage = {
  label: string;
  ratio: number;
  usedTokens: number;
  windowTokens: number;
};

export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) {
    return `${tokens}`;
  }

  const thousands = tokens / 1_000;
  const digits = thousands >= 10 ? 0 : 1;
  return `${thousands.toFixed(digits)}k`;
}

export function estimateConversationContextUsage(
  texts: readonly string[],
  windowTokens: number = DEFAULT_AGENT_CONTEXT_WINDOW_TOKENS,
): ConversationContextUsage {
  const usedTokens = texts.reduce(
    (total, text) => total + estimateTokenCount(text),
    0,
  );
  const safeWindow = Math.max(windowTokens, 1);
  const ratio = Math.min(1, usedTokens / safeWindow);

  return {
    label: `${formatTokenCount(usedTokens)} / ${formatTokenCount(safeWindow)}`,
    ratio,
    usedTokens,
    windowTokens: safeWindow,
  };
}
