/**
 * Prefer chat-friendly plain text on paste.
 * - Keep paragraph breaks (`\n\n`)
 * - Collapse soft/single newlines inside a paragraph to spaces
 *   (clipboard HTML and wrapped copy often inject hard breaks)
 */
export function normalizeComposerPasteText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/\n{2,}/)
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
