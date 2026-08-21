export const MAX_CONFIGURED_SKILL_SLUGS = 100;
export const MAX_SKILL_SLUG_LENGTH = 160;

/**
 * Global skill rows are readable by every tenant, so null ownership and
 * caller-controlled config flags are not sufficient provenance. These stable
 * migration-owned id/slug pairs are the complete server trust root for the
 * executable built-in catalog.
 */
export const BUILT_IN_SKILL_CATALOG = [
  {
    id: 'cskillbuiltincontentgeo',
    slug: 'content-geo-optimizer',
  },
  {
    id: 'cskillbuiltincontentwrite',
    slug: 'content-writing',
  },
  {
    id: 'cskillbuiltinimagegenerate',
    slug: 'image-generation',
  },
  {
    id: 'cskillbuiltintrenddiscover',
    slug: 'trend-discovery',
  },
  {
    id: 'cskillbuiltintrendremix',
    slug: 'trend-remix',
  },
] as const;

export function isBuiltInSkillIdentity(id: unknown, slug: unknown): boolean {
  return BUILT_IN_SKILL_CATALOG.some(
    (entry) => entry.id === id && entry.slug === slug,
  );
}

export function isReservedBuiltInSkillSlug(slug: unknown): boolean {
  return BUILT_IN_SKILL_CATALOG.some((entry) => entry.slug === slug);
}
