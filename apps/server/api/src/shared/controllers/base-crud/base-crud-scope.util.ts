/** Resolve a canonical scalar FK or populated Prisma relation to its id. */
export function resolveScopeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value || null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = (value as { id?: unknown }).id;

  return typeof candidate === 'string' && candidate ? candidate : null;
}
