import { Parser } from 'htmlparser2';

/**
 * Elements that end a block of prose. Closing one emits a paragraph break.
 */
const BLOCK_TAGS = new Set(['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']);

/**
 * Elements that end a line without starting a new paragraph.
 */
const LINE_TAGS = new Set(['li']);

/**
 * Elements whose content is markup or styling rather than prose. Their children
 * are dropped instead of being flattened into the output, so a `<script>` body
 * never turns into visible caption text.
 */
const SKIPPED_TAGS = new Set([
  'noscript',
  'script',
  'style',
  'template',
  'title',
]);

/**
 * HTML to Plain Text Utility
 * Converts HTML content to plain text while preserving line breaks
 * Used for converting rich text editor output to platform-compatible text
 *
 * The input is tokenized by `htmlparser2` rather than rewritten with patterns.
 * That matters for two reasons:
 *
 * 1. Tags are recognized the way a browser recognizes them, so a `>` inside a
 *    quoted attribute value (`<a title="a>b">`) or inside an HTML comment does
 *    not terminate the tag early and leave markup residue in the output.
 * 2. Entities are decoded in a single pass. The previous implementation chained
 *    sequential replacements, so the output of one rule was re-consumed by the
 *    next: `&amp;lt;` decoded to `&lt;` and then to `<`, turning text that had
 *    been safely escaped upstream back into live markup.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }

  const parts: string[] = [];
  let skipDepth = 0;

  const parser = new Parser(
    {
      onclosetag(name) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }
        if (skipDepth > 0) {
          return;
        }
        if (BLOCK_TAGS.has(name)) {
          parts.push('\n\n');
          return;
        }
        if (LINE_TAGS.has(name)) {
          parts.push('\n');
        }
      },
      onopentag(name) {
        if (SKIPPED_TAGS.has(name)) {
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

  parser.write(html);
  parser.end();

  const text = parts
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
