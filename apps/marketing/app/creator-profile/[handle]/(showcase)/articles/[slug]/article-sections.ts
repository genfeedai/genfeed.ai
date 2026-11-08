import type {
  ArticleSection,
  ArticleSections,
} from '@props/content/public-article.props';

const HEADING_PATTERN = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const ID_ATTRIBUTE_PATTERN = /\sid\s*=\s*(["'])(.*?)\1/i;
const HTML_TAGS_PATTERN = /<[^>]*>/g;
const NON_ALPHANUMERIC_RUNS_PATTERN = /[^a-z0-9]+/g;
const EDGE_HYPHENS_PATTERN = /^-+|-+$/g;
const MAX_ID_LENGTH = 80;

const HTML_ENTITIES: Record<string, string> = {
  '&#39;': "'",
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&quot;': '"',
};
const HTML_ENTITY_PATTERN = /&(?:#39|amp|apos|gt|lt|nbsp|quot);/g;

function headingText(innerHtml: string): string {
  return innerHtml
    .replace(HTML_TAGS_PATTERN, '')
    .replace(HTML_ENTITY_PATTERN, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyHeading(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUNS_PATTERN, '-')
    .slice(0, MAX_ID_LENGTH)
    .replace(EDGE_HYPHENS_PATTERN, '');
}

/**
 * Gives every h2 and h3 of an already-sanitized article body a stable id
 * derived from its text (`#stage-1-build-the-cast`) plus a `#` link to
 * itself, and returns the outline. Done on the server so anchors exist in the
 * first byte a reader or crawler receives, and a shared `#section` link lands
 * before any script runs.
 */
export function buildArticleSections(sanitizedHtml: string): ArticleSections {
  const sections: ArticleSection[] = [];
  const usedIds = new Map<string, number>();

  const html = sanitizedHtml.replace(
    HEADING_PATTERN,
    (
      match,
      rawLevel: string,
      rawAttributes: string | undefined,
      inner: string,
    ) => {
      const label = headingText(inner);
      if (!label) {
        return match;
      }

      const attributes = rawAttributes ?? '';
      const existingId = attributes.match(ID_ATTRIBUTE_PATTERN)?.[2];
      const baseId =
        slugifyHeading(existingId ?? '') || slugifyHeading(label) || 'section';
      const seen = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, seen + 1);
      const id = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
      const level = rawLevel === '2' ? 2 : 3;
      sections.push({ id, label, level });

      const keptAttributes = attributes.replace(ID_ATTRIBUTE_PATTERN, '');
      return `<h${level} id="${id}" class="scroll-mt-24"${keptAttributes}>${inner}<a class="gen-heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a></h${level}>`;
    },
  );

  return { html, sections };
}
