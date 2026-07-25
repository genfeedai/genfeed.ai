import { BadRequestException } from '@nestjs/common';

/**
 * Resolves the id of a Prisma relation without trusting the Mongo-era alias.
 *
 * Prisma rows always carry the scalar foreign key (`organizationId`, `brandId`,
 * `userId`, `credentialId`). The legacy `*Document` types additionally declare
 * relation aliases (`organization`, `brand`, `user`, `credential`) typed as
 * `string`, but at runtime that alias is one of three different things
 * depending on how the row was loaded:
 *
 * - a **populated relation object** — the query passed a populate/include
 *   (e.g. `PostsService.findOne` defaults to populating brand/user/credential),
 * - an **id string** — back-filled by `BaseService.normalizeDocument` from the
 *   scalar FK when no relation was included,
 * - **`undefined`** — neither happened (`credential` is never back-filled).
 *
 * Reading the alias directly therefore type-checks but silently produces
 * `"[object Object]"` or `"undefined"` when stringified, which reaches Postgres
 * as a bogus foreign key (P2003), and — worse — produces `undefined` filter
 * values that `normalizeWhere` drops, silently widening a tenant-scoped query.
 *
 * Always prefer the scalar FK. This helper is the single implementation of the
 * scalar-first read that was previously hand-rolled per call site.
 *
 * @see .agents/memory/rules/prisma_legacy_alias_fields.md
 */
export function resolveRelationId(
  scalarId: unknown,
  alias?: unknown,
): string | undefined {
  const fromScalar = toIdString(scalarId);
  if (fromScalar) {
    return fromScalar;
  }

  return toIdString(alias);
}

/**
 * Same as {@link resolveRelationId}, but fails closed: callers that use the
 * result to scope a tenant query or to write a non-nullable foreign key must
 * never proceed with a missing id, because an absent filter value widens the
 * query instead of narrowing it.
 *
 * @throws BadRequestException when neither the scalar FK nor the alias yields an id.
 */
export function requireRelationId(
  scalarId: unknown,
  alias: unknown,
  field: string,
  context: string,
): string {
  const id = resolveRelationId(scalarId, alias);

  if (!id) {
    throw new BadRequestException(
      `${context} is missing a resolvable '${field}' id`,
    );
  }

  return id;
}

/**
 * Narrows the three runtime shapes to a non-empty id string.
 * Populated relations expose `id` (Prisma) and/or `_id` (legacy alias).
 */
function toIdString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as { id?: unknown; _id?: unknown };

  if (typeof record.id === 'string' && record.id.length > 0) {
    return record.id;
  }

  if (typeof record._id === 'string' && record._id.length > 0) {
    return record._id;
  }

  return undefined;
}
