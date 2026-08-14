export function readObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function getCanonicalId(value: unknown): string | undefined {
  const id = readObjectRecord(value).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function shouldRestrictBrandsToMemberList(
  memberBrandIds: string[] | undefined,
  isSuperAdmin: boolean,
): boolean {
  return Boolean(memberBrandIds && memberBrandIds.length > 0 && !isSuperAdmin);
}

export function buildMeBrandsWhere(input: {
  isDeleted: boolean;
  isSuperAdmin: boolean;
  memberBrandIds?: string[];
  organizationId: string;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {
    isDeleted: input.isDeleted,
    organizationId: input.organizationId,
  };

  if (
    shouldRestrictBrandsToMemberList(input.memberBrandIds, input.isSuperAdmin)
  ) {
    where.id = { in: input.memberBrandIds };
  }

  return where;
}

export function nestedSettingsRecord(userData: unknown): unknown {
  return readObjectRecord(userData).settings;
}
