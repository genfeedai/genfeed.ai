/**
 * Display and slug formatting for SCREAMING_SNAKE enum values.
 *
 * Enums that back a Prisma column store SCREAMING_SNAKE labels so the domain
 * value equals the Postgres label exactly (see
 * `.agents/memory/rules/enum_source_of_truth.md`). That value is *storage*, not
 * product language: `IMAGE_EDIT` must never reach a URL or a rendered string.
 *
 * - `formatEnumLabel` → `'IMAGE_EDIT'` becomes `'Image Edit'` (UI text)
 * - `toEnumSlug` → `'IMAGE_EDIT'` becomes `'image-edit'` (URLs, filenames)
 *
 * Mirrors the `formatPlatformLabel` pattern in `platform.util.ts`. Prefer these
 * over ad-hoc `.toLowerCase()` / `capitalize` CSS on a raw enum value.
 */

/**
 * Segments that stay fully uppercase in a display label. Without this,
 * `GIF` title-cases to `Gif` and `NSFW` to `Nsfw`.
 */
const ACRONYM_SEGMENTS: ReadonlySet<string> = new Set([
  'AI',
  'API',
  'BTS',
  'CTA',
  'GIF',
  'ID',
  'NSFW',
  'SEO',
  'SFW',
  'TTS',
  'UGC',
  'URL',
  'UTM',
]);

/** Split on `_`, `-`, and whitespace so mixed vocabularies normalize alike. */
const SEGMENT_SEPARATOR = /[_\-\s]+/;

function toSegments(value: string): string[] {
  return value.split(SEGMENT_SEPARATOR).filter(Boolean);
}

/**
 * Human label for UI text, badges, aria labels, and logs.
 *
 * Returns null when the input is not a non-empty string, so callers can fall
 * back to their own placeholder rather than rendering `undefined`.
 */
export function formatEnumLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const segments = toSegments(value.trim());
  if (segments.length === 0) {
    return null;
  }

  return segments
    .map((segment) => {
      const upper = segment.toUpperCase();
      if (ACRONYM_SEGMENTS.has(upper)) {
        return upper;
      }

      return upper.charAt(0) + segment.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * URL/filename-safe slug for an enum value.
 *
 * Returns null when the input is not a non-empty string so callers never build
 * a path segment out of `undefined`.
 */
export function toEnumSlug(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const segments = toSegments(value.trim());
  if (segments.length === 0) {
    return null;
  }

  return segments.map((segment) => segment.toLowerCase()).join('-');
}
