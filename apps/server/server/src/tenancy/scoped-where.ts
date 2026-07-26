export function scopedWhere<W extends Record<string, unknown>>(
  organizationId: string,
  where?: W,
): W & { isDeleted: false; organizationId: string } {
  if (!organizationId) {
    throw new Error('scopedWhere: organizationId is required');
  }

  return { ...(where as W), isDeleted: false, organizationId };
}

export function brandScope(
  brandId: string | null | undefined,
): { brandId: string } | Record<string, never> {
  return brandId ? { brandId } : {};
}
