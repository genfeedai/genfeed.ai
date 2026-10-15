import { Parser } from 'htmlparser2';

// Kept apart from `sanitize-html.helper` so callers that only need plain text
// do not bundle `sanitize-html` and its PostCSS dependency.

/**
 * Block-level elements whose closing tag ends a paragraph. Mirrors
 * `apps/server/api/src/shared/utils/html-to-text/html-to-text.util.ts` — keep
 * the two in sync if this list changes.
 */
const PLAIN_TEXT_BLOCK_TAGS = new Set([
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
]);

/** Elements whose closing tag ends a line without starting a new paragraph. */
const PLAIN_TEXT_LINE_TAGS = new Set(['li']);

/**
 * Drop markup and collapse whitespace so titles, captions, and tweet bodies
 * can be shown as the operator-facing text rather than stored HTML.
 *
 * `sanitize-html` (used by `sanitizeHtml`/`createMarkup` in
 * `sanitize-html.helper`) is the wrong
 * tool for this: with `allowedTags: []` it still HTML-escapes text content —
 * `Q&A` comes back as `Q&amp;A` — because its output is meant to be safe to
 * re-embed as HTML, not read as plain text. It also drops all structural
 * information, so `<p>A</p><p>B</p>` collapses to `"AB"` with no separator.
 * Parsing with `htmlparser2` directly and decoding entities in one pass (not
 * chained replacements, which can re-open escaped markup: `&amp;lt;` ->
 * `&lt;` -> `<`) avoids both problems and preserves paragraph/line breaks.
 */
export function stripHtmlToPlainText(value?: string | null): string {
  if (!value) {
    return '';
  }

  const parts: string[] = [];
  let skipDepth = 0;

  const parser = new Parser(
    {
      onclosetag(name) {
        if (name === 'script' || name === 'style') {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }
        if (skipDepth > 0) {
          return;
        }
        if (PLAIN_TEXT_BLOCK_TAGS.has(name)) {
          parts.push('\n\n');
          return;
        }
        if (PLAIN_TEXT_LINE_TAGS.has(name)) {
          parts.push('\n');
        }
      },
      onopentag(name) {
        if (name === 'script' || name === 'style') {
          skipDepth += 1;
          return;
        }
        if (skipDepth === 0 && name === 'br') {
          parts.push('\n');
        }
      },
      ontext(text) {
        if (skipDepth === 0) {
          parts.push(text);
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(value);
  parser.end();

  return parts
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
