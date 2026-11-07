import { escapeHtmlText } from '@genfeedai/helpers/security/escape-html.helper';

const AMP_ENTITIES_PATTERN = /&amp;/g;
const LT_ENTITIES_PATTERN = /&lt;/g;
const GT_ENTITIES_PATTERN = /&gt;/g;
const NBSP_ENTITIES_PATTERN = /&nbsp;/g;
const BLOCK_CLOSING_TAGS_PATTERN = /<\/(p|div|li|h[1-6])>/gi;
const BR_TAGS_PATTERN = /<br\s*\/?>/gi;
const HTML_TAGS_PATTERN = /<[^>]+>/g;

/**
 * The harness persistence shape stores prose fields as newline-joined
 * strings/arrays (see `IHarnessProfileStructure`, `IHarnessProfileThesis`,
 * etc.). `RichTextEditor` only speaks HTML. These helpers convert at the
 * view edge only — the service/API payload never sees HTML.
 */

function decodeHtmlEntities(value: string): string {
  return value
    .replace(AMP_ENTITIES_PATTERN, '&')
    .replace(LT_ENTITIES_PATTERN, '<')
    .replace(GT_ENTITIES_PATTERN, '>')
    .replace(NBSP_ENTITIES_PATTERN, ' ');
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

  return trimmedLines.map((line) => `<p>${escapeHtmlText(line)}</p>`).join('');
}

/**
 * Converts `RichTextEditor`'s HTML output back into a plain newline-joined
 * string, for saving through the existing draft-update callbacks.
 */
export function harnessEditorHtmlToLines(html: string): string {
  const withBreaks = html
    .replace(BLOCK_CLOSING_TAGS_PATTERN, '\n')
    .replace(BR_TAGS_PATTERN, '\n');
  const withoutTags = withBreaks.replace(HTML_TAGS_PATTERN, '');

  return withoutTags
    .split('\n')
    .map((line) => decodeHtmlEntities(line).trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
