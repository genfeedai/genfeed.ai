import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { Timeframe } from '@genfeedai/contracts';

export const BRAND_NICHE_MAX_QUERIES = 3;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
  'your',
  'you',
  'our',
  'we',
]);

export interface BrandNicheInput {
  categories?: string[];
  description?: string | null;
  hashtags?: string[];
  keywords?: string[];
}

function normalizeTerm(value: string): string {
  return value
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeTerm(value)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token));
}

function uniqueTerms(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? []).map(normalizeTerm).filter((value) => value.length > 1),
    ),
  ];
}

/**
 * Search queries that describe a brand's niche, strongest signal first:
 * explicit keywords, then hashtags, then categories. A brand that has not set
 * any of those falls back to the leading words of its description so a
 * connected brand still gets niche results instead of a generic viral feed.
 */
export function buildBrandNicheQueries(input: BrandNicheInput): string[] {
  const explicit = [
    ...uniqueTerms(input.keywords),
    ...uniqueTerms(input.hashtags),
    ...uniqueTerms(input.categories),
  ];
  const queries = [...new Set(explicit)];
  if (queries.length === 0 && input.description) {
    const words = tokenize(input.description).slice(0, 4);
    if (words.length > 0) {
      queries.push(words.join(' '));
    }
  }
  return queries.slice(0, BRAND_NICHE_MAX_QUERIES);
}

function videoSearchText(video: TrendingVideoDocument): string {
  return [video.title, video.description, video.hook, ...(video.hashtags ?? [])]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

/**
 * The brand's niche terms a video mentions in its caption or hashtags. A term
 * matches when every one of its words appears (`ai` only as a whole word) or
 * when it appears run together as a hashtag (`#aiinfluencers`).
 */
export function matchedNicheTerms(
  video: TrendingVideoDocument,
  terms: string[],
): string[] {
  const text = normalizeTerm(videoSearchText(video));
  if (!text) {
    return [];
  }
  const words = new Set(text.split(' '));
  const hashtags = (video.hashtags ?? []).map((tag) =>
    normalizeTerm(tag).replace(/\s/g, ''),
  );
  const matched: string[] = [];
  for (const term of terms) {
    const termWords = tokenize(term);
    if (termWords.length === 0) {
      continue;
    }
    const hasAllWords = termWords.every((word) =>
      word === 'ai' ? words.has(word) : text.includes(word),
    );
    const compactTerm = termWords.join('');
    // Hashtags run words together; a short term would match inside any word.
    const isHashtagMatch =
      compactTerm.length >= 5 &&
      hashtags.some((tag) => tag.includes(compactTerm));
    if (hasAllWords || isHashtagMatch) {
      matched.push(term);
    }
  }
  return matched;
}

/** How many of the brand's niche terms a video mentions. */
export function countNicheTermMatches(
  video: TrendingVideoDocument,
  terms: string[],
): number {
  return matchedNicheTerms(video, terms).length;
}

/**
 * Relevance first, engagement second. Callers decide what is eligible; this
 * only orders. A video that came back from searching
 * the brand's niche counts as one match on its own, so TikTok's own search
 * ranking is kept even when a caption is empty or only an emoji.
 */
export function rankBrandVideos(
  videos: TrendingVideoDocument[],
  terms: string[],
): TrendingVideoDocument[] {
  return videos
    .map((video) => ({
      engagement: video.viralScore ?? 0,
      relevance:
        countNicheTermMatches(video, terms) * 2 +
        (typeof video.nicheQuery === 'string' ? 1 : 0),
      video,
      views: video.viewCount ?? 0,
    }))
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.engagement - a.engagement ||
        b.views - a.views,
    )
    .map((item) => item.video);
}

const TIMEFRAME_HOURS: Partial<Record<Timeframe, number>> = {
  [Timeframe.D7]: 168,
  [Timeframe.H24]: 24,
  [Timeframe.H72]: 72,
};

/** Keeps a video only when it was published inside the requested window. */
export function isWithinTimeframe(
  video: TrendingVideoDocument,
  timeframe?: Timeframe,
  now: number = Date.now(),
): boolean {
  const hours = timeframe ? TIMEFRAME_HOURS[timeframe] : undefined;
  if (!hours) {
    return true;
  }
  const publishedAt = video.publishedAt
    ? new Date(video.publishedAt).getTime()
    : Number.NaN;
  return Number.isFinite(publishedAt) && publishedAt >= now - hours * 3600000;
}
