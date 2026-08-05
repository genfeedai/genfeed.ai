import { BadRequestException } from '@nestjs/common';

/** Resolve a canonical entity ID from a scalar or an included Prisma row. */
export function resolveEntityId(value: unknown): string | undefined {
  return toIdString(value);
}

/**
 * Require a canonical scalar foreign key and fail closed when it is absent.
 *
 * @throws BadRequestException when neither the scalar FK nor the alias yields an id.
 */
export function requireRelationId(
  scalarId: unknown,
  field: string,
  context: string,
): string {
  const id = typeof scalarId === 'string' && scalarId ? scalarId : undefined;

  if (!id) {
    throw new BadRequestException(
      `${context} is missing a resolvable '${field}' id`,
    );
  }

  return id;
}

/**
 * Narrows a scalar ID or included Prisma row to a non-empty ID string.
 */
function toIdString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as { id?: unknown };

  if (typeof record.id === 'string' && record.id.length > 0) {
    return record.id;
  }

  return undefined;
}
