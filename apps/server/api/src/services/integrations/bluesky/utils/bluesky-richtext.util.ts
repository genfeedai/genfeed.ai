/**
 * Rich text facets for a Bluesky post.
 *
 * Bluesky has no markup: links, mentions and hashtags are annotations
 * ("facets") that point at byte ranges of the UTF-8 text. The detection here
 * is deliberately conservative: only explicit `http(s)://` links, handles
 * that look like a domain name, and `#tags`. Anything it does not recognise
 * stays plain text, which is always valid.
 */

const LINK_FEATURE = 'app.bsky.richtext.facet#link';
const MENTION_FEATURE = 'app.bsky.richtext.facet#mention';
const TAG_FEATURE = 'app.bsky.richtext.facet#tag';

const LINK_PATTERN = /(^|[\s(])(https?:\/\/[^\s]+)/gi;
const MENTION_PATTERN =
  /(^|[\s(])@((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?)(?![a-z0-9-])/gi;
const TAG_PATTERN = /(^|\s)(#[^\d\s]\S*)/gu;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?'"]+$/;
const TRAILING_TAG_PUNCTUATION_PATTERN = /\p{P}+$/u;
const MAX_TAG_GRAPHEMES = 64;

type FacetSpanKind = 'link' | 'mention' | 'tag';

/** A detected range in UTF-16 string indices (end exclusive). */
export interface BlueskyFacetSpan {
  end: number;
  kind: FacetSpanKind;
  start: number;
  /** The link URI, the handle without `@`, or the tag without `#`. */
  value: string;
}

export type BlueskyFacetFeature =
  | { $type: typeof LINK_FEATURE; uri: string }
  | { $type: typeof MENTION_FEATURE; did: string }
  | { $type: typeof TAG_FEATURE; tag: string };

export interface BlueskyFacet {
  features: BlueskyFacetFeature[];
  index: { byteEnd: number; byteStart: number };
}

function trimLink(raw: string): string {
  let link = raw.replace(TRAILING_PUNCTUATION_PATTERN, '');
  // A closing parenthesis belongs to the link only when it opens one inside.
  while (link.endsWith(')') && !link.includes('(')) {
    link = link.slice(0, -1).replace(TRAILING_PUNCTUATION_PATTERN, '');
  }
  return link;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Find link, mention and hashtag ranges, sorted and without overlaps. */
export function detectBlueskyFacetSpans(text: string): BlueskyFacetSpan[] {
  const spans: BlueskyFacetSpan[] = [];

  for (const match of text.matchAll(LINK_PATTERN)) {
    const link = trimLink(match[2]);
    if (!isHttpUrl(link)) {
      continue;
    }
    const start = (match.index ?? 0) + match[1].length;
    spans.push({
      end: start + link.length,
      kind: 'link',
      start,
      value: link,
    });
  }

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    spans.push({
      end: start + match[2].length + 1,
      kind: 'mention',
      start,
      value: match[2].toLowerCase(),
    });
  }

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = match[2].replace(TRAILING_TAG_PUNCTUATION_PATTERN, '');
    const name = tag.slice(1);
    if (!name || Array.from(name).length > MAX_TAG_GRAPHEMES) {
      continue;
    }
    const start = (match.index ?? 0) + match[1].length;
    spans.push({ end: start + tag.length, kind: 'tag', start, value: name });
  }

  spans.sort((a, b) => a.start - b.start);

  // Facets must not overlap: keep the first of any overlapping pair.
  const kept: BlueskyFacetSpan[] = [];
  for (const span of spans) {
    const previous = kept[kept.length - 1];
    if (!previous || span.start >= previous.end) {
      kept.push(span);
    }
  }
  return kept;
}

/**
 * Facets for a post text. `resolveHandle` turns a mention's handle into a DID;
 * a handle that does not resolve is left as plain text.
 */
export async function buildBlueskyFacets(
  text: string,
  resolveHandle: (handle: string) => Promise<string | null>,
): Promise<BlueskyFacet[]> {
  const facets: BlueskyFacet[] = [];

  for (const span of detectBlueskyFacetSpans(text)) {
    let feature: BlueskyFacetFeature;
    if (span.kind === 'link') {
      feature = { $type: LINK_FEATURE, uri: span.value };
    } else if (span.kind === 'tag') {
      feature = { $type: TAG_FEATURE, tag: span.value };
    } else {
      const did = await resolveHandle(span.value);
      if (!did) {
        continue;
      }
      feature = { $type: MENTION_FEATURE, did };
    }

    // Offsets are bytes of the UTF-8 encoding, not UTF-16 string indices.
    const byteStart = Buffer.byteLength(text.slice(0, span.start), 'utf8');
    const byteEnd =
      byteStart + Buffer.byteLength(text.slice(span.start, span.end), 'utf8');
    facets.push({ features: [feature], index: { byteEnd, byteStart } });
  }

  return facets;
}
