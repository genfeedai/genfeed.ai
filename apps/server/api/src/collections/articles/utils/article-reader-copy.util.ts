import { BadRequestException } from '@nestjs/common';

/**
 * A published article is reader copy only. Research and drafting notes written
 * while the article was produced ("What we could not verify", a scraped page
 * that blocked access, a `[TODO]` slot, a `[VIDEO LINK]` stub) are not part of
 * it. They reached a live article once because nothing between the writer and
 * the public page looked for them, so saving a published article now refuses
 * them and names the part to remove.
 */

const HEADING_PATTERN = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
const TAG_PATTERN = /<[^>]*>/g;

const PROCESS_NOTE_HEADINGS: readonly RegExp[] = [
  /^what (?:we|i) (?:could ?not|couldn['’]?t|can['’]?t|cannot|were unable to|was unable to) (?:verify|confirm|check|access|reach|find)\b/i,
  /^(?:unverified|unconfirmed) (?:claims?|items?|figures?|numbers?)\b/i,
  /^(?:research|verification|drafting|process|agent) notes?\b/i,
  /^limitations of (?:this|the) research\b/i,
  /^sources? (?:we|i) (?:could ?not|couldn['’]?t) (?:access|reach|open)\b/i,
];

const PLACEHOLDER_PATTERN =
  /\[(?:TODO|TBD|FIXME|PLACEHOLDER|VIDEO LINK|INSERT[^\]]*)[^\]]*\]/;

/**
 * Articles live at `/@<handle>/articles/<slug>`. The retired `/articles/<slug>`
 * path answers 404, and eleven help articles still linked to it (51 dead links)
 * because nothing checked the body they were saved with.
 */
const LEGACY_ARTICLE_LINK_PATTERN =
  /\bhref\s*=\s*["']((?:https?:\/\/(?:www\.)?genfeed\.ai)?\/articles\/[^"'#?\s]+)/i;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  rsquo: '’',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
      const code = Number.parseInt(decimal ?? hex ?? '', decimal ? 10 : 16);
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    },
  );
}

function headingText(rawHeading: string): string {
  return decodeEntities(rawHeading.replace(TAG_PATTERN, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first process note in the article HTML, or undefined when it is clean. */
export function findArticleProcessNote(
  html: string | null | undefined,
): string | undefined {
  if (!html) return undefined;

  for (const match of html.matchAll(HEADING_PATTERN)) {
    const heading = headingText(match[1] ?? '');
    if (PROCESS_NOTE_HEADINGS.some((pattern) => pattern.test(heading))) {
      return `the section "${heading}"`;
    }
  }

  // Readers see the rendered text, so a placeholder split by markup or written
  // with character references counts: "[<strong>TODO</strong>]", "&#91;TODO&#93;".
  const placeholder = decodeEntities(html.replace(TAG_PATTERN, '')).match(
    PLACEHOLDER_PATTERN,
  );
  if (placeholder) return `the placeholder ${placeholder[0]}`;

  return undefined;
}

/** The first link to the retired `/articles/<slug>` path, or undefined when there is none. */
export function findLegacyArticleLink(
  html: string | null | undefined,
): string | undefined {
  return html?.match(LEGACY_ARTICLE_LINK_PATTERN)?.[1];
}

export function assertArticleIsReaderCopy(
  html: string | null | undefined,
): void {
  const note = findArticleProcessNote(html);
  if (note) {
    throw new BadRequestException(
      `A published article cannot contain research or drafting notes: remove ${note}. Cut what could not be verified, or state its limit inside the sentence it affects.`,
    );
  }

  const legacyLink = findLegacyArticleLink(html);
  if (legacyLink) {
    throw new BadRequestException(
      `A published article cannot link to ${legacyLink}: that path no longer exists. Link to https://genfeed.ai/@<handle>/articles/<slug> instead.`,
    );
  }
}
