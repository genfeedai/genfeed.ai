/**
 * The harness persistence shape stores prose fields as newline-joined
 * strings/arrays (see `IHarnessProfileStructure`, `IHarnessProfileThesis`,
 * etc.). `RichTextEditor` only speaks HTML. These helpers convert at the
 * view edge only — the service/API payload never sees HTML.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Converts a stored newline-joined string (or the array it was split from)
 * into `<p>` blocks per line, for loading into `RichTextEditor`.
 */
export function harnessLinesToEditorHtml(
  value: string[] | string | undefined,
): string {
  const lines = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n')
      : [];

  const trimmedLines = lines.map((line) => line.trim()).filter(Boolean);

  if (trimmedLines.length === 0) {
    return '';
  }

  return trimmedLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

/**
 * Converts `RichTextEditor`'s HTML output back into a plain newline-joined
 * string, for saving through the existing draft-update callbacks.
 */
export function harnessEditorHtmlToLines(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');

  return withoutTags
    .split('\n')
    .map((line) => decodeHtmlEntities(line).trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
