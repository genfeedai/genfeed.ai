export const GENERATION_PROMPT_COMPACT_ROWS = 2;
export const GENERATION_PROMPT_COMPACT_MAX_HEIGHT = 72;
export const GENERATION_PROMPT_PREVIEW_CHAR_BUDGET = 160;

export function shouldOfferGenerationPromptPreview(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return false;
  }

  const lineCount = prompt.split(/\r?\n/u).length;
  return (
    lineCount > GENERATION_PROMPT_COMPACT_ROWS ||
    trimmed.length > GENERATION_PROMPT_PREVIEW_CHAR_BUDGET
  );
}
