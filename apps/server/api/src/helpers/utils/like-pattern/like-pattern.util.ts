const LIKE_WILDCARD_CHARS_PATTERN = /[\\%_]/g;

/**
 * The term with PostgreSQL `LIKE` wildcards escaped, so `%`, `_` and `\` match
 * themselves. Prisma's `contains` and `string_contains` pass the term into
 * `ILIKE` as-is (verified on Prisma 7.10.1 / PostgreSQL 16, #8846), so escape
 * once here and nowhere else.
 */
export function escapeLikeWildcards(value: string): string {
  return value.replace(LIKE_WILDCARD_CHARS_PATTERN, '\\$&');
}

/** Case-insensitive "contains" pattern for raw SQL, wildcards escaped. */
export function toContainsPattern(value: string): string {
  return `%${escapeLikeWildcards(value)}%`;
}
