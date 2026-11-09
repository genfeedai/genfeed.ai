/** Enough of a gated article to judge it: about two short paragraphs. */
const PREVIEW_MIN_CHARACTERS = 600;
const PREVIEW_MAX_BLOCKS = 3;

const BLOCK_END_PATTERN =
  /<\/(?:p|h[1-6]|ul|ol|blockquote|pre|figure|table|div)>/gi;
const TAG_PATTERN = /<[^>]*>/g;
const PARAGRAPH_BREAK_PATTERN = /\n\s*\n/;
const WHITESPACE_PATTERN = /\s+/g;

function textLength(html: string): number {
  return html.replace(TAG_PATTERN, '').trim().length;
}

function splitHtmlBlocks(content: string): string[] {
  const blocks: string[] = [];
  let start = 0;
  for (const match of content.matchAll(BLOCK_END_PATTERN)) {
    const end = (match.index ?? 0) + match[0].length;
    blocks.push(content.slice(start, end));
    start = end;
  }
  const rest = content.slice(start);
  if (rest.trim()) {
    blocks.push(rest);
  }
  return blocks;
}

/**
 * The free part of a gated article or issue (#9718): its first blocks, up to
 * about {@link PREVIEW_MIN_CHARACTERS} characters of text and never more than
 * half of the body, so a paid piece always withholds something. Works on HTML
 * (split at block ends) and on plain text or Markdown (split at blank lines).
 */
export function buildContentPreview(
  content: string | null | undefined,
): string {
  if (!content?.trim()) {
    return '';
  }
  const isHtml = BLOCK_END_PATTERN.test(content);
  BLOCK_END_PATTERN.lastIndex = 0;
  const blocks = isHtml
    ? splitHtmlBlocks(content)
    : content.split(PARAGRAPH_BREAK_PATTERN).filter((block) => block.trim());
  const limit = Math.max(
    1,
    Math.min(PREVIEW_MAX_BLOCKS, Math.floor(blocks.length / 2)),
  );

  const kept: string[] = [];
  let characters = 0;
  for (const block of blocks) {
    if (kept.length >= limit || characters >= PREVIEW_MIN_CHARACTERS) {
      break;
    }
    kept.push(block);
    characters += textLength(block);
  }
  if (blocks.length === 1) {
    // One long block: keep the first half of its text, cut at a word.
    const text = content
      .replace(TAG_PATTERN, ' ')
      .replace(WHITESPACE_PATTERN, ' ')
      .trim();
    // One character past the middle, so a word ending there is kept whole.
    const half = text.slice(0, Math.floor(text.length / 2) + 1);
    const lastSpace = half.lastIndexOf(' ');
    const cut = `${lastSpace > 0 ? half.slice(0, lastSpace) : half}…`;
    return isHtml ? `<p>${cut}</p>` : cut;
  }
  return isHtml ? kept.join('') : kept.join('\n\n');
}

type GateableContent = {
  accessLevel?: string | null;
  content?: string | null;
};

/** Whether only readers with access may see this piece in full. */
export function isGatedContent(item: GateableContent): boolean {
  return Boolean(item.accessLevel) && item.accessLevel !== 'public';
}

/**
 * What an anonymous reader, a feed or an outside platform may receive: the
 * full body of a public piece, the preview of a gated one (#9718). The server
 * withholds the rest; hiding it in the browser is not enough.
 */
export function withholdGatedContent<T extends GateableContent>(item: T): T {
  return isGatedContent(item)
    ? { ...item, content: buildContentPreview(item.content) }
    : item;
}
