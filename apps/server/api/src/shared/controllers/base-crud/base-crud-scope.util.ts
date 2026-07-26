/**
 * Resolve a tenancy pointer to its string id.
 *
 * Rows are Prisma-shaped, so the scalar FK (`organizationId` / `brandId`) is
 * the value that actually exists at runtime. The Mongo-era alias
 * (`organization` / `brand`) is only defined when a controller populates it,
 * in which case it arrives as a relation object.
 */
export function resolveScopeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value || null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as { _id?: unknown; id?: unknown };
  const candidate = record.id ?? record._id;

  return typeof candidate === 'string' && candidate ? candidate : null;
}
