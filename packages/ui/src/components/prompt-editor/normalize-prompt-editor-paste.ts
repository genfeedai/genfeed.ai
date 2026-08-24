/**
 * Prefer chat-friendly plain text on paste.
 * Keep paragraph breaks (`\n\n`) and collapse soft/single newlines.
 */
export function normalizePromptEditorPasteText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trimEnd())
        .join(' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter((block) => block.length > 0)
    .join('\n\n');
}
