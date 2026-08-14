/**
 * Relation-alias reads are banned. Empty map: any identity-key / coercion /
 * filter-value / identity-comparison hit fails the guard.
 *
 * @see .agents/memory/rules/prisma_legacy_alias_fields.md
 */

export const RELATION_ALIAS_READ_BASELINE: Readonly<Record<string, number>> =
  {};
