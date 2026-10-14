import { sanitizeHtml } from '@genfeedai/helpers';
import TurndownService from 'turndown';

/** Dev.to accepts at most four tags on `POST /articles`. */
const DEVTO_TAG_LIMIT = 4;
const DEVTO_TAG_MAX_LENGTH = 30;

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  fence: '```',
  headingStyle: 'atx',
  strongDelimiter: '**',
});

/**
 * `Article.content` is HTML. Dev.to only accepts Markdown in `body_markdown`,
 * so this publisher converts at the edge. Sanitization runs first so script
 * and other disallowed markup never become article text. Leftover tags
 * outside fenced code are dropped so the body is not HTML sent as Markdown.
 */
export function htmlToDevtoMarkdown(html: string): string {
  const sanitized = sanitizeHtml(html);
  if (!sanitized.trim()) {
    return '';
  }
  return stripHtmlOutsideFences(turndown.turndown(sanitized)).trim();
}

/**
 * Dev.to tags are a comma-separated channel setting. Keep the first four
 * alphanumeric tags; anything past that is dropped rather than rejected by
 * the provider.
 */
export function readDevtoTags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const tags: string[] = [];
  for (const part of value.split(',')) {
    const tag = part
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, DEVTO_TAG_MAX_LENGTH);
    if (!tag || tags.includes(tag)) {
      continue;
    }
    tags.push(tag);
    if (tags.length === DEVTO_TAG_LIMIT) {
      break;
    }
  }
  return tags;
}

function stripHtmlOutsideFences(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(/<\/?[a-zA-Z][^>\n]*>/g, ''),
    )
    .join('');
}
