import { BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-validation.constant';

export function buildBuiltInCatalogWhere(): Record<string, unknown> {
  return {
    AND: [
      { organizationId: null },
      { config: { equals: true, path: ['isBuiltIn'] } },
      { config: { equals: 'built_in', path: ['source'] } },
      {
        OR: BUILT_IN_SKILL_CATALOG.map(({ id, slug }) => ({
          AND: [{ id }, { config: { equals: slug, path: ['slug'] } }],
        })),
      },
    ],
  };
}

export function buildAccessibleSkillWhere(
  organizationId: string,
  userId?: string,
  grantedSkillIds: readonly string[] = [],
): Record<string, unknown> {
  const visible: Record<string, unknown>[] = [
    { organizationId },
    buildBuiltInCatalogWhere(),
  ];
  if (userId) {
    visible.unshift({ ownerKind: 'user', ownerUserId: userId });
  }
  if (grantedSkillIds.length > 0) {
    visible.push({ id: { in: [...grantedSkillIds] } });
  }
  return {
    AND: [{ isDeleted: false }, { isQuarantined: false }, { OR: visible }],
  };
}
