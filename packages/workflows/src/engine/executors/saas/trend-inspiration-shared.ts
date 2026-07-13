// =============================================================================
// SHARED TREND-INSPIRATION HELPERS
// =============================================================================
//
// Extracted from the trend inspiration trio (trendVideoInspiration,
// trendHashtagInspiration) which previously duplicated these helpers verbatim.
// Mirrors the SEO trio's shared-module pattern (see seo-score-executor.ts).

/** Platforms the trend inspiration executors can target. */
export type TrendInspirationPlatform =
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'youtube'
  | 'reddit';

export const VALID_PLATFORMS = new Set<TrendInspirationPlatform>([
  'tiktok',
  'instagram',
  'twitter',
  'youtube',
  'reddit',
]);

/** Returns the trimmed string, or null for non-strings and blank strings. */
export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Strips a leading `#` and any non-`[a-zA-Z0-9_]` characters. */
function stripHashtag(value: string): string {
  return value.replace(/^#/, '').replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Bare hashtag slug (no leading `#`), preserving case and underscores.
 * Falls back to `'trend'` when the value normalizes to empty.
 */
export function normalizeHashtag(value: string): string {
  const stripped = stripHashtag(value);
  return stripped.length > 0 ? stripped : 'trend';
}

/** `#`-prefixed hashtag. Never null — an empty value becomes `#trend`. */
export function buildHashtag(value: string): string {
  return `#${normalizeHashtag(value)}`;
}

/**
 * `#`-prefixed hashtag, or null when the value normalizes to empty. Use when
 * empty inputs should be dropped rather than coerced to a `#trend` placeholder.
 */
export function buildOptionalHashtag(value: string): string | null {
  const stripped = stripHashtag(value);
  return stripped.length > 0 ? `#${stripped}` : null;
}

/**
 * De-dupes hashtags case-insensitively via {@link buildHashtag}. Empty inputs
 * are coerced to `#trend`, so every input yields an entry.
 */
export function uniqHashtags(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = buildHashtag(value);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

/**
 * De-dupes hashtags case-insensitively via {@link buildOptionalHashtag},
 * dropping any value that normalizes to empty.
 */
export function uniqOptionalHashtags(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const hashtag = buildOptionalHashtag(value);
    if (!hashtag) {
      continue;
    }

    const key = hashtag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(hashtag);
  }

  return result;
}
