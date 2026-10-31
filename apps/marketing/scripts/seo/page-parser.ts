/**
 * Dependency-free HTML → SEO fact extraction.
 *
 * Deliberately regex-based rather than DOM-based: this runs against rendered
 * server output in CI, where pulling a parser into the website workspace buys
 * nothing. Everything here is pure so the rule layer stays unit-testable.
 */

export interface JsonLdBlock {
  /** Parsed value, or null when the block is not valid JSON. */
  readonly value: unknown;
  readonly raw: string;
  readonly parseError: string | null;
}

export interface PageFacts {
  readonly title: string | null;
  readonly description: string | null;
  readonly canonical: string | null;
  readonly robots: string | null;
  readonly h1s: string[];
  readonly openGraph: Record<string, string>;
  readonly twitter: Record<string, string>;
  readonly jsonLd: JsonLdBlock[];
  /** Word count of visible body text, scripts and styles removed. */
  readonly wordCount: number;
  readonly imagesWithoutAlt: number;
  readonly internalLinkCount: number;
}

const VOID_BLOCK_TAGS =
  /<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

/** Highest value String.fromCodePoint accepts; anything above throws RangeError. */
const MAX_CODE_POINT = 0x10ffff;

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const digits = isHex ? entity.slice(2) : entity.slice(1);
      const isWellFormed = (isHex ? /^[0-9a-f]+$/i : /^[0-9]+$/).test(digits);
      const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
      // The character class also admits hex digits in a decimal entity, and any
      // digit run can exceed the Unicode range. Both would make fromCodePoint
      // throw out of parsePage, taking the whole audit down — including the
      // SEO_SOFT guard, which sits far downstream. Leave the source text alone
      // instead, the same way an unparseable JSON-LD block is tolerated.
      if (!isWellFormed || codePoint > MAX_CODE_POINT) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Collapse a fragment of markup down to its visible text. */
export function toText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull the attributes off a single tag string such as `<meta name="x" …>`. */
export function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null = pattern.exec(tag);
  while (match !== null) {
    const name = (match[1] ?? '').toLowerCase();
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    match = pattern.exec(tag);
  }
  return attributes;
}

function matchAllTags(html: string, tagName: string): string[] {
  const tags: string[] = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match !== null) {
    tags.push(match[0]);
    match = pattern.exec(html);
  }
  return tags;
}

export function parsePage(html: string): PageFacts {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? toText(titleMatch[1] ?? '') : null;

  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  let description: string | null = null;
  let robots: string | null = null;

  for (const tag of matchAllTags(html, 'meta')) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property ?? attributes.name ?? '').toLowerCase();
    const content = attributes.content ?? '';
    if (key === '') {
      continue;
    }
    if (key === 'description') {
      description = content;
    } else if (key === 'robots') {
      robots = content;
    } else if (key.startsWith('og:')) {
      openGraph[key] = content;
    } else if (key.startsWith('twitter:')) {
      twitter[key] = content;
    }
  }

  let canonical: string | null = null;
  for (const tag of matchAllTags(html, 'link')) {
    const attributes = parseAttributes(tag);
    if ((attributes.rel ?? '').toLowerCase() === 'canonical') {
      canonical = attributes.href ?? null;
      break;
    }
  }

  const h1s: string[] = [];
  const h1Pattern = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let h1Match: RegExpExecArray | null = h1Pattern.exec(html);
  while (h1Match !== null) {
    h1s.push(toText(h1Match[1] ?? ''));
    h1Match = h1Pattern.exec(html);
  }

  const jsonLd: JsonLdBlock[] = [];
  const scriptPattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null = scriptPattern.exec(html);
  while (scriptMatch !== null) {
    const raw = (scriptMatch[1] ?? '').trim();
    try {
      jsonLd.push({ parseError: null, raw, value: JSON.parse(raw) });
    } catch (error) {
      jsonLd.push({
        parseError: error instanceof Error ? error.message : String(error),
        raw,
        value: null,
      });
    }
    scriptMatch = scriptPattern.exec(html);
  }

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const bodyHtml = bodyMatch ? (bodyMatch[1] ?? '') : html;
  const visibleText = toText(bodyHtml.replace(VOID_BLOCK_TAGS, ' '));
  const wordCount = visibleText === '' ? 0 : visibleText.split(/\s+/).length;

  const imagesWithoutAlt = matchAllTags(bodyHtml, 'img').filter((tag) => {
    const attributes = parseAttributes(tag);
    return attributes.alt === undefined;
  }).length;

  const internalLinkCount = matchAllTags(bodyHtml, 'a').filter((tag) => {
    const href = parseAttributes(tag).href ?? '';
    return href.startsWith('/') && !href.startsWith('//');
  }).length;

  return {
    canonical,
    description,
    h1s,
    imagesWithoutAlt,
    internalLinkCount,
    jsonLd,
    openGraph,
    robots,
    title,
    twitter,
    wordCount,
  };
}
