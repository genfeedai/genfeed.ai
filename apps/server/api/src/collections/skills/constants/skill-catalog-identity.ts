/**
 * Stable identity scheme for the executable + first-party built-in catalog.
 *
 * Format: `cskillbuiltin` + compact slug (lowercase, non-alphanumerics stripped).
 * The original five handler identities are explicit constants and must never
 * be regenerated — `content-geo-optimizer` stays `cskillbuiltincontentgeo`,
 * not `cskillbuiltincontentgeooptimizer`.
 */

export const BUILT_IN_SKILL_ID_PREFIX = 'cskillbuiltin';

export interface BuiltInSkillIdentity {
  id: string;
  slug: string;
}

/**
 * Migration-owned handler identities. Do not rename, reorder, or regenerate.
 */
export const ORIGINAL_BUILT_IN_SKILL_CATALOG = [
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
] as const satisfies readonly BuiltInSkillIdentity[];

export type OriginalBuiltInSkillSlug =
  (typeof ORIGINAL_BUILT_IN_SKILL_CATALOG)[number]['slug'];

export function compactBuiltInSkillId(slug: string): string {
  return `${BUILT_IN_SKILL_ID_PREFIX}${slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}`;
}

export function isOriginalBuiltInSkillSlug(
  slug: unknown,
): slug is OriginalBuiltInSkillSlug {
  return ORIGINAL_BUILT_IN_SKILL_CATALOG.some((entry) => entry.slug === slug);
}

export function builtInSkillIdentityForSlug(
  slug: string,
): BuiltInSkillIdentity {
  const original = ORIGINAL_BUILT_IN_SKILL_CATALOG.find(
    (entry) => entry.slug === slug,
  );

  if (original) {
    return original;
  }

  return {
    id: compactBuiltInSkillId(slug),
    slug,
  };
}

export function mergeBuiltInSkillCatalog(
  firstParty: readonly BuiltInSkillIdentity[],
): BuiltInSkillIdentity[] {
  const bySlug = new Map<string, BuiltInSkillIdentity>();

  for (const entry of ORIGINAL_BUILT_IN_SKILL_CATALOG) {
    bySlug.set(entry.slug, entry);
  }

  for (const entry of firstParty) {
    if (!bySlug.has(entry.slug)) {
      bySlug.set(entry.slug, {
        id: builtInSkillIdentityForSlug(entry.slug).id,
        slug: entry.slug,
      });
    }
  }

  return [...bySlug.values()];
}
