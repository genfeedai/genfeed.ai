/**
 * Canonical tenant scope for a Prisma `where`.
 *
 * `organizationId` is spread last and is deliberately non-overridable — that is
 * the tenant guarantee, and a caller must never be able to widen past it.
 * `isDeleted` is spread first, so a caller that explicitly asks for tombstones
 * (`{ isDeleted: true }`) gets them rather than being silently clobbered back
 * to the default. This mirrors `BaseService.withSoftDeleteFilter`.
 *
 * `where` is `NoInfer` so the type parameter is fixed by the call site's
 * expected type — the Prisma `…WhereInput` the result is assigned to — instead
 * of by the literal in isolation. Without it the literal was typed on its own,
 * so an enum filter widened (`status: { in: ['GENERATED'] }` became
 * `string[]`) and the result no longer satisfied the delegate's input type.
 */
export function scopedWhere<W extends Record<string, unknown>>(
  organizationId: string,
  where?: NoInfer<W>,
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
