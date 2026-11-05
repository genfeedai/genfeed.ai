const CR_LINE_ENDINGS_PATTERN = /\r\n?/g;
const NON_BREAKING_SPACES_PATTERN = /\u00a0/g;
const BLANK_LINE_RUN_PATTERN = /\n(?:[ \t]*\n)+/;
const REPEATED_INLINE_SPACES_PATTERN = /[ \t]{2,}/g;

/**
 * Prefer chat-friendly plain text on paste.
 * Keep paragraph breaks (`\n\n`) and collapse soft/single newlines.
 */
export function normalizePromptEditorPasteText(raw: string): string {
  return raw
    .replace(CR_LINE_ENDINGS_PATTERN, '\n')
    .replace(NON_BREAKING_SPACES_PATTERN, ' ')
    .split(BLANK_LINE_RUN_PATTERN)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trimEnd())
        .join(' ')
        .replace(REPEATED_INLINE_SPACES_PATTERN, ' ')
        .trim(),
    )
    .filter((block) => block.length > 0)
    .join('\n\n');
}
