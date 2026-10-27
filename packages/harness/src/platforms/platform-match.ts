import type { ContentKind } from '../types';

const MOTION_FORMATS = new Set<ContentKind>([
  'script',
  'ugc',
  'video',
  'video-script',
]);

/**
 * True when `platform` names one of `aliases`, either bare (`linkedin`), as a
 * domain (`linkedin.com`) or as a scoped channel (`linkedin/posts`).
 */
export function matchesPlatform(
  platform: string | null | undefined,
  aliases: readonly string[],
): boolean {
  const normalized = platform?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return aliases.some(
    (alias) =>
      normalized === alias ||
      normalized === `${alias}.com` ||
      normalized.startsWith(`${alias}/`),
  );
}

/** Formats a platform pack treats as spoken or filmed rather than read. */
export function isMotionFormat(contentType: ContentKind): boolean {
  return MOTION_FORMATS.has(contentType);
}
