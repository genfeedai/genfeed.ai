/**
 * Relation-alias reads are banned. Empty map: any identity-key / coercion /
 * filter-value / identity-comparison hit fails the guard.
 *
 * @see docs/identity-resolution.md
 */

export const RELATION_ALIAS_READ_BASELINE: Readonly<Record<string, number>> =
  {};
