import { sanitizeHtml } from '@genfeedai/helpers';
import TurndownService from 'turndown';

const WHITESPACE_PATTERN = /\s+/g;
const HTML_TAGS_PATTERN = /<\/?[a-zA-Z][^>\n]*>/g;
const FENCED_CODE_BLOCKS_PATTERN = /(```[\s\S]*?```)/g;
const TRAILING_BLANK_LINES_PATTERN = /\n{3,}/g;
const WIDE_BULLET_PATTERN = /^(\s*)-\s{3}/gm;

const SITE_NAME = 'Genfeed';
const SITE_URL = 'https://genfeed.ai';

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  fence: '```',
  headingStyle: 'atx',
  strongDelimiter: '**',
});

export interface ArticleMarkdownInput {
  /** Byline. Falls back to the publishing brand when the article names none. */
  authorName?: string | null;
  /** The article page, which stays the canonical URL. */
  articleUrl: string;
  /** Sanitized-on-the-way-in article HTML. */
  contentHtml?: string | null;
  /** Publishing brand, such as the creator profile name. */
  brandName: string;
  isPaid?: boolean;
  /** This document's own URL. */
  markdownUrl: string;
  publishedAt?: string | null;
  summary?: string | null;
  tags?: ReadonlyArray<string | null | undefined>;
  title: string;
  updatedAt?: string | null;
}

/** Collapse a value to one line so it cannot break the Markdown structure. */
function toSingleLine(value: string): string {
  return value.replace(WHITESPACE_PATTERN, ' ').trim();
}

function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const time = Date.parse(value);

  return Number.isNaN(time)
    ? undefined
    : new Date(time).toISOString().slice(0, 10);
}

/**
 * `Article.content` is HTML. Sanitize first so script and other disallowed
 * markup never becomes article text, convert, then drop any tag left outside a
 * fenced code block so the body is Markdown and not HTML wearing a Markdown
 * extension.
 */
export function articleHtmlToMarkdown(html: string | null | undefined): string {
  const sanitized = sanitizeHtml(html ?? '');

  if (!sanitized.trim()) {
    return '';
  }

  return turndown
    .turndown(sanitized)
    .split(FENCED_CODE_BLOCKS_PATTERN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(HTML_TAGS_PATTERN, '')
            .replace(WIDE_BULLET_PATTERN, '$1- '),
    )
    .join('')
    .replace(TRAILING_BLANK_LINES_PATTERN, '\n\n')
    .trim();
}

function countWords(markdown: string): number {
  const text = markdown.trim();

  return text ? text.split(WHITESPACE_PATTERN).length : 0;
}

/**
 * The agent-readable copy of a public article: the same words as the page,
 * with a short brief on top that carries what an agent needs to cite it
 * correctly (canonical URL, author, dates, topics, how to attribute). The
 * brief is facts about the article; it never gives the reader instructions.
 */
export function buildArticleMarkdown(input: ArticleMarkdownInput): string {
  const title = toSingleLine(input.title) || 'Article';
  const summary = toSingleLine(input.summary ?? '');
  const author = toSingleLine(input.authorName ?? '') || input.brandName;
  const published = toIsoDate(input.publishedAt);
  const updated = toIsoDate(input.updatedAt);
  const topics = (input.tags ?? [])
    .map((tag) => toSingleLine(tag ?? ''))
    .filter(Boolean);
  const body = articleHtmlToMarkdown(input.contentHtml);
  const words = countWords(body);

  const citation = [
    `"${title}"`,
    author,
    ...(input.brandName === author ? [] : [input.brandName]),
    SITE_NAME,
    ...(published ? [published] : []),
    input.articleUrl,
  ].join(', ');

  const brief = [
    `- **Canonical URL:** ${input.articleUrl}`,
    `- **Markdown URL:** ${input.markdownUrl}`,
    `- **Author:** ${author}`,
    `- **Publisher:** ${SITE_NAME} (${SITE_URL})`,
    ...(published ? [`- **Published:** ${published}`] : []),
    ...(updated && updated !== published ? [`- **Updated:** ${updated}`] : []),
    ...(topics.length > 0 ? [`- **Topics:** ${topics.join(', ')}`] : []),
    ...(words > 0 ? [`- **Length:** about ${words} words`] : []),
    ...(input.isPaid
      ? [
          '- **Access:** paid article. This is the public preview; the full text is for readers with access.',
        ]
      : []),
    '- **Reuse:** quote with attribution and a link to the canonical URL. Not licensed for model training.',
    `- **Cite as:** ${citation}`,
  ].join('\n');

  return [
    `# ${title}`,
    ...(summary ? [`> ${summary}`] : []),
    '## Agent brief',
    brief,
    '## Article',
    body || '_This article has no public text yet._',
  ]
    .join('\n\n')
    .concat('\n');
}

export interface ArticleIndexEntry {
  markdownUrl: string;
  publishedAt?: string | null;
  summary?: string | null;
  title: string;
}

/**
 * The `llms.txt`-style index of public articles: one line per article with a
 * link to its Markdown copy and its summary, newest first as given.
 */
export function buildArticleIndexMarkdown(
  entries: readonly ArticleIndexEntry[],
): string {
  const lines = entries.map((entry) => {
    const title = toSingleLine(entry.title) || 'Article';
    const summary = toSingleLine(entry.summary ?? '');
    const published = toIsoDate(entry.publishedAt);
    const detail = [published, summary].filter(Boolean).join(' · ');

    return `- [${title}](${entry.markdownUrl})${detail ? `: ${detail}` : ''}`;
  });

  return [
    `# ${SITE_NAME} articles`,
    `> Public articles published on ${SITE_NAME}, newest first. Each link is the Markdown copy of an article, which opens with a short brief (canonical URL, author, dates, topics, how to cite) followed by the full text.`,
    '## Articles',
    lines.length > 0 ? lines.join('\n') : '_No public articles yet._',
    '## More',
    `- [Product index for LLMs](${SITE_URL}/llms.txt): Compact index of the public site.`,
    `- [Full product text for LLMs](${SITE_URL}/llms-full.txt): Comprehensive inline content.`,
  ]
    .join('\n\n')
    .concat('\n');
}
