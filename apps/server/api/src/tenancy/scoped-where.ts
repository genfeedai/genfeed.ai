/**
 * Canonical tenant scope for a Prisma `where`.
 *
 * `organizationId` is spread last and is deliberately non-overridable — that is
 * the tenant guarantee, and a caller must never be able to widen past it.
 * `isDeleted` is spread first, so a caller that explicitly asks for tombstones
 * (`{ isDeleted: true }`) gets them rather than being silently clobbered back
 * to the default. This mirrors `BaseService.withSoftDeleteFilter`.
 *
 * The `where` literal is typed on its own here, not against the delegate's
 * `…WhereInput`, so it gets no contextual type from Prisma. Pass enum members
 * rather than their string labels — `status: { in: [IngredientStatus.GENERATED] }`,
 * never `{ in: ['GENERATED'] }` — or the array widens to `string[]` and the
 * result stops satisfying the delegate's input type. Using the enum members is
 * the repository rule regardless; this is where skipping it fails loudly.
 */
export function scopedWhere<W extends Record<string, unknown>>(
  organizationId: string,
  where?: W,
): W & { isDeleted: boolean; organizationId: string } {
  if (!organizationId) {
    throw new Error('scopedWhere: organizationId is required');
  }

  return { isDeleted: false, ...(where as W), organizationId };
}

export function brandScope(
  brandId: string | null | undefined,
): { brandId: string } | Record<string, never> {
  return brandId ? { brandId } : {};
}
