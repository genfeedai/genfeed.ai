/** Partial unique index over live published article slugs (SQL-only). */
export const PUBLIC_ARTICLE_SLUG_INDEX = 'articles_public_slug_uidx';

/**
 * True when `error` is Prisma's unique-constraint violation (P2002) for the
 * public article slug. Prisma reports a raw partial index by its name or by
 * its column list, so accept either.
 */
export function isPublicSlugUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { code, meta } = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (code !== 'P2002') {
    return false;
  }

  const target = meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(
    (entry) =>
      typeof entry === 'string' &&
      (entry === 'slug' || entry.includes(PUBLIC_ARTICLE_SLUG_INDEX)),
  );
}
